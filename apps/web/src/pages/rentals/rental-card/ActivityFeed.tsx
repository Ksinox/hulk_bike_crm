/**
 * ActivityFeed — расширенная лента событий для drawer «История» в карточке
 * аренды (Phase 2, v0.6.6).
 *
 * Особенности:
 *  • Поиск (title + sub + who) + pill-фильтры по типу (Деньги / Просрочки /
 *    Экипировка / Скутер / Тариф / Всё) + счётчик отфильтрованных событий.
 *  • Группировка по дню — sticky-заголовок YYYY-MM-DD.
 *  • Каждая строка: цветная вертикальная полоса по типу, круглая иконка,
 *    title жирный, sub серый, who/time мелким серым, сумма цветная справа
 *    (если есть). По hover/click открывается diff-блок «было → стало»
 *    из item.meta.diff (см. apps/api/src/services/activityLog.ts).
 *
 * Диапазон отображаемых типов («tone») вычисляется из action — см. mapType().
 * Для незнакомых action — fallback на «ink» (нейтральный серый).
 */
import { useMemo, useState } from "react";
import {
  Wallet,
  Repeat,
  Lock,
  HardHat,
  Bike,
  AlertTriangle,
  Gift,
  Coins,
  Sparkles,
  Search,
  ArrowRight,
  Plus,
  Eye,
  FileText,
  RefreshCw,
  RotateCcw,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApiActivityItem } from "@/lib/api/activity";

/** Type-family (определяет цвет, иконку, label). */
type FeedTone = "green" | "red" | "blue" | "orange" | "ink";
type FeedType =
  | "payment"
  | "extend"
  | "deposit"
  | "deposit-up"
  | "equipment"
  | "scooter"
  | "overdue"
  | "forgive"
  | "tariff"
  | "created"
  | "damage"
  | "document"
  | "status"
  | "manual-debt"
  | "refund"
  | "other";

const FEED_TYPE: Record<
  FeedType,
  { icon: LucideIcon; tone: FeedTone; label: string }
> = {
  payment: { icon: Wallet, tone: "green", label: "Платёж" },
  extend: { icon: Repeat, tone: "blue", label: "Продление" },
  deposit: { icon: Lock, tone: "blue", label: "Залог" },
  "deposit-up": { icon: Plus, tone: "blue", label: "Залог" },
  equipment: { icon: HardHat, tone: "orange", label: "Экипировка" },
  scooter: { icon: Bike, tone: "ink", label: "Скутер" },
  overdue: { icon: AlertTriangle, tone: "red", label: "Просрочка" },
  forgive: { icon: Gift, tone: "green", label: "Прощение" },
  tariff: { icon: Coins, tone: "blue", label: "Тариф" },
  created: { icon: Sparkles, tone: "ink", label: "Старт" },
  damage: { icon: AlertTriangle, tone: "red", label: "Ущерб" },
  document: { icon: FileText, tone: "blue", label: "Документ" },
  status: { icon: RefreshCw, tone: "ink", label: "Статус" },
  "manual-debt": { icon: Plus, tone: "red", label: "Ручной долг" },
  refund: { icon: RotateCcw, tone: "green", label: "Возврат" },
  other: { icon: MoreHorizontal, tone: "ink", label: "Событие" },
};

/** Tone → стиль (background/ink/raw) — через Tailwind tokens. */
const TONE_BG: Record<FeedTone, string> = {
  green: "hsl(var(--green-soft))",
  red: "hsl(var(--red-soft))",
  blue: "hsl(var(--blue-50))",
  orange: "hsl(var(--orange-soft))",
  ink: "hsl(var(--surface-soft))",
};
const TONE_INK: Record<FeedTone, string> = {
  green: "hsl(var(--green-ink))",
  red: "hsl(var(--red-ink))",
  blue: "hsl(var(--blue-700))",
  orange: "hsl(var(--orange-ink))",
  ink: "hsl(var(--ink-2))",
};
const TONE_RAW: Record<FeedTone, string> = {
  green: "hsl(var(--green))",
  red: "hsl(var(--red))",
  blue: "hsl(var(--blue-600))",
  orange: "hsl(var(--orange))",
  ink: "hsl(var(--ink))",
};

/** Diff field shape — должен соответствовать DiffField на бэкенде. */
type DiffKind = "money" | "date" | "list" | "text" | "number";
type DiffField = {
  label: string;
  from: unknown;
  to: unknown;
  kind: DiffKind;
  suffix?: string;
};
type DiffPayload = Record<string, DiffField>;

type Filter = "all" | "money" | "overdue" | "equipment" | "scooter" | "tariff";

/** Карта action → feed-type. */
function mapType(item: ApiActivityItem): FeedType {
  const a = item.action;
  if (
    a === "created" ||
    a === "rental_created" ||
    (a === "created" && item.entity === "rental")
  )
    return "created";
  if (a === "rental_extended" || a === "extended") return "extend";
  if (a === "scooter_swapped") return "scooter";
  if (a === "equipment_changed") return "equipment";
  if (a === "completed") return "status";
  if (a === "status_changed") return "status";
  if (a === "security_topped_up") return "deposit-up";
  if (a === "debt_payment" || a === "payment_received") return "payment";
  if (a === "refund_issued" || a === "deposit_returned") return "refund";
  if (
    a === "debt_overdue_forgiven" ||
    a === "debt_overdue_fine_forgiven" ||
    a === "debt_overdue_days_forgiven" ||
    a === "debt_manual_forgiven"
  )
    return "forgive";
  if (a === "debt_manual") return "manual-debt";
  if (a.includes("damage")) return "damage";
  if (a === "document_saved" || a === "document_downloaded" || a === "document_printed" || a === "document_snapshot_deleted")
    return "document";
  return "other";
}

/** Достать ₽-сумму из item.meta (для крайнего правого числа в строке). */
function extractAmount(item: ApiActivityItem): number {
  const meta = (item.meta ?? {}) as Record<string, unknown>;
  // Положительные кейсы (увеличение долга/принятая оплата).
  if (item.action === "debt_payment" && typeof meta.amount === "number")
    return meta.amount;
  if (item.action === "debt_manual" && typeof meta.amount === "number")
    return -meta.amount;
  // Diff-driven: если есть kind=money, берём (to - from).
  const diff = (meta.diff ?? null) as DiffPayload | null;
  if (diff) {
    for (const k of Object.keys(diff)) {
      const f = diff[k];
      if (
        f.kind === "money" &&
        typeof f.from === "number" &&
        typeof f.to === "number"
      ) {
        return f.to - f.from;
      }
    }
  }
  return 0;
}

/** Главный компонент. */
export function ActivityFeed({
  items,
  loading,
}: {
  items: ApiActivityItem[];
  loading?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  /** Вычисляем для каждого item его feed-type один раз. */
  const enriched = useMemo(() => {
    return items.map((it) => {
      const type = mapType(it);
      const amount = extractAmount(it);
      return { item: it, type, amount };
    });
  }, [items]);

  const visible = useMemo(() => {
    return enriched.filter(({ item, type }) => {
      if (filter !== "all") {
        if (
          filter === "money" &&
          !["payment", "extend", "deposit", "deposit-up", "forgive"].includes(
            type,
          )
        )
          return false;
        if (filter === "overdue" && !["overdue", "forgive"].includes(type))
          return false;
        if (filter === "equipment" && type !== "equipment") return false;
        if (filter === "scooter" && type !== "scooter") return false;
        if (filter === "tariff" && type !== "tariff") return false;
      }
      if (query && query.trim()) {
        const q = query.trim().toLowerCase();
        const hay =
          `${item.summary} ${item.action} ${item.userName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [enriched, filter, query]);

  /** Группировка по дню — формат DD.MM.YYYY. */
  type Group = {
    day: string;
    items: typeof visible;
  };
  const groups = useMemo(() => {
    const out: Group[] = [];
    let cur: Group | null = null;
    for (const v of visible) {
      const d = new Date(v.item.createdAt);
      const day =
        `${String(d.getDate()).padStart(2, "0")}.` +
        `${String(d.getMonth() + 1).padStart(2, "0")}.` +
        `${d.getFullYear()}`;
      if (!cur || cur.day !== day) {
        cur = { day, items: [] };
        out.push(cur);
      }
      cur.items.push(v);
    }
    return out;
  }, [visible]);

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "Всё" },
    { id: "money", label: "Деньги" },
    { id: "overdue", label: "Просрочки" },
    { id: "equipment", label: "Экипировка" },
    { id: "scooter", label: "Скутер" },
    { id: "tariff", label: "Тариф" },
  ];

  if (loading) {
    return (
      <div className="px-5 py-6 text-[12.5px] text-muted">
        Загружаем ленту событий…
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-10 bg-surface border-b border-border px-5 pt-4 pb-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по событиям, суммам, людям…"
              className="w-full bg-surface-soft border border-border rounded-[10px] pl-7 pr-3 py-1.5 text-[12.5px] text-ink placeholder:text-muted-2 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="text-[11px] text-muted-2 tabular-nums">
            {visible.length} событий
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full px-3 py-1 text-[11.5px] font-semibold border transition-colors",
                filter === f.id
                  ? "bg-ink text-white border-transparent"
                  : "bg-surface text-muted border-border hover:bg-surface-soft",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="mt-2 text-[10.5px] text-muted-2 inline-flex items-center gap-1.5">
          <Eye size={11} className="text-blue-600" />
          Наведите курсор на строку, чтобы увидеть «было → стало».
        </div>
      </div>

      <div className="px-5 pb-5 pt-2">
        {visible.length === 0 && (
          <div className="text-center py-10 text-[12.5px] text-muted">
            Ничего не найдено по фильтрам
          </div>
        )}
        {groups.map((g) => (
          <div key={g.day} className="mb-4">
            <div className="sticky top-[126px] z-[5] bg-surface py-1.5 -mx-1 px-1 text-[10.5px] font-bold uppercase tracking-wider text-muted-2 tabular-nums">
              {g.day}
            </div>
            <div className="flex flex-col gap-1.5">
              {g.items.map((v) => (
                <ActivityRow
                  key={v.item.id}
                  item={v.item}
                  type={v.type}
                  amount={v.amount}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * v0.6.16: вернуть URL сохранённого снапшота документа, если событие
 * связано с документом. Используется для onClick — оператор кликает по
 * строке «Документ» и снапшот открывается в новой вкладке.
 */
function snapshotUrl(item: ApiActivityItem): string | null {
  const meta = (item.meta ?? {}) as Record<string, unknown>;
  const snapshotId =
    typeof meta.snapshotId === "number" ? meta.snapshotId : null;
  if (snapshotId == null) return null;
  const base =
    (import.meta.env.VITE_API_URL?.replace(/\/$/, "") as string | undefined) ??
    "";
  return `${base}/api/rental-document-snapshots/${snapshotId}/file?format=html`;
}

function ActivityRow({
  item,
  type,
  amount,
}: {
  item: ApiActivityItem;
  type: FeedType;
  amount: number;
}) {
  // v0.6.8: open/hover state для плавной раскрывашки.
  //   • setOpen(true)  — onMouseEnter / клик / focus.
  //   • setOpen(false) — onMouseLeave / повторный клик / blur.
  // Анимация — через CSS-grid (grid-template-rows 0fr ↔ 1fr) — это
  // даёт плавное «складывание» БЕЗ фиксированного max-height; высота
  // блока считается браузером по контенту.
  const [open, setOpen] = useState(false);
  const meta = FEED_TYPE[type];
  const IconC = meta.icon;
  const positive = amount > 0;
  const itemMeta = (item.meta ?? {}) as Record<string, unknown>;
  const diff =
    (itemMeta.diff as DiffPayload | undefined) ?? undefined;
  const hasDiff = !!diff && Object.keys(diff).length > 0;
  const time = new Date(item.createdAt).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  // v0.6.10: subtitle берём из meta.note/comment если есть — это
  // более «человеческое» описание помимо короткого summary.
  const subtitle = (() => {
    const raw =
      (typeof itemMeta.note === "string" && itemMeta.note) ||
      (typeof itemMeta.comment === "string" && itemMeta.comment) ||
      "";
    return raw && raw !== item.summary ? raw : "";
  })();

  const docUrl = snapshotUrl(item);

  return (
    <div className="relative flex items-stretch gap-3 group">
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          // v0.6.16: для документов — открыть сохранённый снапшот в новой
          // вкладке. Игнорируем если был зажат meta/shift (свои интенты).
          if (docUrl && !e.metaKey && !e.shiftKey) {
            window.open(docUrl, "_blank", "noopener");
            return;
          }
          setOpen((o) => !o);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn(
          "flex-1 min-w-0 text-left rounded-[14px] border border-transparent cursor-pointer",
          // v0.6.8: плавный hover — background и border одновременно.
          "transition-[background-color,border-color,box-shadow] duration-200 ease-out",
          "hover:border-border hover:shadow-card-sm",
          open ? "bg-blue-50/40" : "hover:bg-surface",
        )}
      >
        <div className="flex items-stretch">
          {/* v0.6.8: type-stripe — на hover/open становится толще и насыщеннее. */}
          <div
            className={cn(
              "rounded-l-[14px] shrink-0 transition-[width,opacity] duration-200 ease-out",
              open ? "w-[4px] opacity-100" : "w-[3px] opacity-80",
            )}
            style={{ background: TONE_RAW[meta.tone] }}
          />
          <div className="flex-1 min-w-0 p-2.5 pl-3">
            <div className="flex items-start gap-3">
              <div
                className="relative h-9 w-9 shrink-0 rounded-full flex items-center justify-center transition-transform duration-200 ease-out group-hover:scale-[1.04]"
                style={{ background: TONE_BG[meta.tone], color: TONE_INK[meta.tone] }}
              >
                <IconC size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div
                    className="text-[10px] uppercase tracking-wider font-bold tabular-nums"
                    style={{ color: TONE_INK[meta.tone] }}
                  >
                    {meta.label}
                  </div>
                  <span className="text-[10px] text-muted-2 tabular-nums">
                    {time}
                  </span>
                  {item.userName && (
                    <span className="text-[10px] text-muted-2 inline-flex items-center gap-1 ml-auto">
                      <span className="inline-flex items-center justify-center h-[14px] w-[14px] rounded-full bg-surface-soft text-[8px] font-bold text-ink-2 tabular-nums">
                        {avatarLetter(item.userName)}
                      </span>
                      {item.userName}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[13.5px] font-bold text-ink leading-tight">
                  {item.summary}
                </div>
                {subtitle && (
                  <div className="mt-0.5 text-[11.5px] text-muted">
                    {subtitle}
                  </div>
                )}

                {/* v0.6.8: CSS-grid плавная раскрывашка.
                    Wrapper: grid-template-rows 0fr → 1fr (250ms ease-out).
                    Inner: overflow-hidden — обрезает контент пока он
                    «складывается». Padding-top анимируется отдельно
                    чтобы между основной строкой и diff'ом плавно
                    появлялся зазор. */}
                {hasDiff && diff && (
                  <div
                    className={cn(
                      "grid transition-[grid-template-rows,padding-top,opacity] duration-[250ms] ease-out",
                      open
                        ? "grid-rows-[1fr] opacity-100 pt-2"
                        : "grid-rows-[0fr] opacity-0 pt-0",
                    )}
                    aria-hidden={!open}
                  >
                    <div className="overflow-hidden">
                      <div className="grid grid-cols-1 gap-1.5">
                        {Object.entries(diff).map(([k, d], idx) => (
                          <div
                            key={k}
                            className={cn(
                              "transition-[opacity,transform] duration-200 ease-out",
                              open
                                ? "opacity-100 translate-y-0"
                                : "opacity-0 -translate-y-1",
                            )}
                            style={{
                              transitionDelay: open
                                ? `${Math.min(idx * 30, 120)}ms`
                                : "0ms",
                            }}
                          >
                            <DiffRow field={d} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {amount !== 0 && (
                <div className="text-right shrink-0">
                  <div
                    className={cn(
                      "font-display text-[16px] font-extrabold tabular-nums leading-none",
                      positive ? "text-green-ink" : "text-red-ink",
                    )}
                  >
                    {positive ? "+" : ""}
                    {fmtMoney(amount)} ₽
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiffRow({ field }: { field: DiffField }) {
  const { label, from, to, kind, suffix } = field;
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 items-center text-[11.5px]">
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-2 truncate">
        {label}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {kind === "list" ? (
          <ListDiff
            from={(Array.isArray(from) ? from : []) as unknown[]}
            to={(Array.isArray(to) ? to : []) as unknown[]}
          />
        ) : (
          <>
            <DiffPill kind="from" value={from} k={kind} suffix={suffix} />
            <ArrowRight size={11} className="text-muted-2" />
            <DiffPill kind="to" value={to} k={kind} suffix={suffix} />
            {kind === "money" &&
              typeof from === "number" &&
              typeof to === "number" && (
                <DeltaBadge delta={to - from} />
              )}
            {kind === "number" &&
              typeof from === "number" &&
              typeof to === "number" && (
                <DeltaBadge delta={to - from} suffix={suffix} />
              )}
          </>
        )}
      </div>
    </div>
  );
}

function formatVal(v: unknown, k: DiffKind, suffix?: string): string {
  if (v === null || v === undefined || v === "—") return "—";
  if (k === "money") return `${fmtMoney(Number(v))} ₽`;
  if (k === "number")
    return `${fmtMoney(Number(v))}${suffix ? " " + suffix : ""}`;
  if (k === "date") {
    // принимаем ISO-строку или Date
    const d = new Date(v as string);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
  return String(v);
}

function DiffPill({
  kind,
  value,
  k,
  suffix,
}: {
  kind: "from" | "to";
  value: unknown;
  k: DiffKind;
  suffix?: string;
}) {
  const isFrom = kind === "from";
  const isEmpty = value === "—" || value === null || value === undefined;
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded-md tabular-nums font-semibold",
        // v0.6.8: лёгкая scale-in анимация (origin центр), идёт вместе
        // с раскрытием diff-блока через CSS-grid.
        "transition-transform duration-200 ease-out",
        isFrom
          ? "bg-red-soft text-red-ink line-through decoration-red-ink/40"
          : "bg-emerald-100 text-emerald-700",
        isEmpty && "opacity-60 no-underline",
      )}
    >
      {formatVal(value, k, suffix)}
    </span>
  );
}

function DeltaBadge({ delta, suffix }: { delta: number; suffix?: string }) {
  if (!delta) return null;
  const positive = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center text-[10px] font-bold tabular-nums px-1 rounded",
        positive ? "text-green-ink" : "text-red-ink",
      )}
    >
      {positive ? "+" : "−"}
      {fmtMoney(Math.abs(delta))}
      {suffix ? " " + suffix : ""}
    </span>
  );
}

function ListDiff({ from, to }: { from: unknown[]; to: unknown[] }) {
  const fromArr = from.map(String);
  const toArr = to.map(String);
  const fromSet = new Set(fromArr);
  const toSet = new Set(toArr);
  const removed = fromArr.filter((x) => !toSet.has(x));
  const kept = fromArr.filter((x) => toSet.has(x));
  const added = toArr.filter((x) => !fromSet.has(x));
  return (
    <div className="flex flex-wrap gap-1">
      {kept.map((x) => (
        <span
          key={"k" + x}
          className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-surface-soft text-muted text-[11px] font-semibold"
        >
          {x}
        </span>
      ))}
      {removed.map((x) => (
        <span
          key={"r" + x}
          className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-red-soft text-red-ink text-[11px] font-semibold line-through decoration-red-ink/40"
        >
          {x}
        </span>
      ))}
      {added.map((x) => (
        <span
          key={"a" + x}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[11px] font-bold"
        >
          <Plus size={9} /> {x}
        </span>
      ))}
      {fromArr.length === 0 && added.length === 0 && removed.length === 0 && (
        <span className="text-[11px] text-muted-2">пусто</span>
      )}
    </div>
  );
}

function fmtMoney(n: number): string {
  return n.toLocaleString("ru-RU");
}

function avatarLetter(name: string): string {
  const c = name.trim()[0];
  return c ? c.toUpperCase() : "?";
}
