/**
 * HistoryStrip — компактная правая колонка с последними событиями аренды
 * (~16 строк со скроллом). По клику «Открыть всё» — выезжает SideDrawer
 * с полной ActivityTimelineSection.
 *
 * v0.6.2: каждая строка — круглая иконка 7x7 с цветом по типу события
 * (зелёный/красный/синий/оранжевый/нейтральный) — соответствует
 * design/claude-design/Hulk Bike CRM/rental-card.jsx ~608-664.
 */
import {
  ArrowRight,
  History,
  Wallet,
  AlertTriangle,
  Repeat,
  Pencil,
  Plus,
  X,
  Trash2,
  HardHat,
  Bike,
  Gift,
  FileText,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApiActivityItem } from "@/lib/api/activity";

type Tone = "green" | "red" | "blue" | "orange" | "ink";

const TONE_CLASS: Record<Tone, string> = {
  green: "bg-green-soft text-green-ink",
  red: "bg-red-soft text-red-ink",
  blue: "bg-blue-50 text-blue-700",
  orange: "bg-orange-soft text-orange-ink",
  ink: "bg-surface-soft text-ink-2",
};

/**
 * v0.6.17: маппинг action → icon/tone согласован с ActivityFeed.tsx.
 * Таблица соответствий:
 *   equipment       → HardHat   (orange)
 *   payment / debt_payment / damage_payment → Wallet  (green)
 *   extend / rental_extended → Repeat (blue)
 *   damage_report / damage   → AlertTriangle (red/orange)
 *   swap_scooter / scooter_swapped → Bike (ink)
 *   document_*       → FileText  (blue)
 *   forgive / forgive-overdue → Gift (green)
 *   debt_manual / manual-debt → Plus (red)
 *   refund / deposit_returned → RotateCcw (green)
 *   status / status_changed → RefreshCw (ink)
 *   created / rental_created → Sparkles (blue)
 *   updated / changed (общие) → Pencil (ink)
 */
function actionMeta(action: string): { icon: LucideIcon; tone: Tone } {
  // equipment events — самое первое, чтобы не перехватывалось «changed» ниже.
  if (action === "equipment_changed" || action.includes("equipment")) {
    return { icon: HardHat, tone: "orange" };
  }
  if (
    action === "payment_received" ||
    action === "debt_payment" ||
    action === "payment_accepted" ||
    action.includes("paid")
  ) {
    return { icon: Wallet, tone: "green" };
  }
  if (
    action === "debt_overdue_forgiven" ||
    action === "debt_overdue_fine_forgiven" ||
    action === "debt_overdue_days_forgiven" ||
    action === "debt_manual_forgiven" ||
    action.includes("forgiv")
  ) {
    return { icon: Gift, tone: "green" };
  }
  if (action === "rental_extended" || action === "extended" || action.includes("extended")) {
    return { icon: Repeat, tone: "blue" };
  }
  if (action === "rental_created" || action === "created" || action === "activate" || action === "activated") {
    return { icon: Sparkles, tone: "blue" };
  }
  if (action === "scooter_swapped" || action === "swap_scooter") {
    return { icon: Bike, tone: "ink" };
  }
  if (action.includes("damage")) {
    return { icon: AlertTriangle, tone: "red" };
  }
  if (action === "debt_manual" || action === "manual-debt") {
    return { icon: Plus, tone: "red" };
  }
  if (
    action === "refund_issued" ||
    action === "deposit_returned" ||
    action.includes("refund")
  ) {
    return { icon: RotateCcw, tone: "green" };
  }
  if (action === "document_saved" || action === "document_downloaded" || action === "document_printed" || action === "document_snapshot_deleted" || action.includes("document")) {
    return { icon: FileText, tone: "blue" };
  }
  if (action === "status_changed" || action === "completed") {
    return { icon: RefreshCw, tone: "ink" };
  }
  if (action.includes("debt") || action.includes("overdue")) {
    return { icon: AlertTriangle, tone: "red" };
  }
  if (action.includes("cancel")) {
    return { icon: X, tone: "red" };
  }
  if (action.includes("archived") || action.includes("deleted") || action.includes("purged")) {
    return { icon: Trash2, tone: "ink" };
  }
  if (action.includes("updated") || action.includes("edited") || action.includes("changed")) {
    return { icon: Pencil, tone: "ink" };
  }
  return { icon: Pencil, tone: "ink" };
}

export function HistoryStrip({
  items,
  loading,
  onExpand,
}: {
  items: ApiActivityItem[];
  loading?: boolean;
  onExpand: () => void;
}) {
  return (
    <div className="rounded-2xl bg-surface border border-border shadow-card-sm flex flex-col overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2 inline-flex items-center gap-1.5">
            <History size={11} /> История
          </div>
          <div className="text-[11px] text-muted">последние события · скролл</div>
        </div>
        <button
          type="button"
          onClick={onExpand}
          className="inline-flex items-center gap-1 rounded-full bg-surface-soft hover:bg-ink hover:text-white px-2.5 py-1 text-[11px] font-bold text-ink-2 shrink-0"
        >
          Открыть всё <ArrowRight size={11} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto max-h-[420px]">
        {loading ? (
          <div className="px-4 py-6 text-[12px] text-muted">Загружаем…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-6 text-[12px] text-muted">
            Событий ещё нет. Они появятся автоматически по мере работы с
            арендой.
          </div>
        ) : (
          <div className="px-3 py-2 flex flex-col gap-1.5">
            {items.slice(0, 16).map((it) => (
              <HistoryStripRow key={it.id} item={it} />
            ))}
            {items.length > 16 && (
              <button
                type="button"
                onClick={onExpand}
                className="mt-1 py-2 text-[11px] font-bold text-blue-700 hover:underline"
              >
                Показать все {items.length} событий →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** v0.6.17: shape DiffField (как у бэка / ActivityFeed). */
type DiffKind = "money" | "date" | "list" | "text" | "number";
type DiffField = {
  label: string;
  from: unknown;
  to: unknown;
  kind: DiffKind;
  suffix?: string;
};
type DiffPayload = Record<string, DiffField>;

function HistoryStripRow({ item }: { item: ApiActivityItem }) {
  const meta = actionMeta(item.action);
  const Icon = meta.icon;
  const amount = extractAmount(item);
  const positive = amount != null && amount > 0;
  const itemMeta = (item.meta ?? {}) as Record<string, unknown>;
  const diff = (itemMeta.diff as DiffPayload | undefined) ?? undefined;
  const chips = diff ? collectDiffChips(diff) : [];
  return (
    <div className="flex items-start gap-2.5 px-1.5 py-1.5 rounded-[10px] hover:bg-surface-soft">
      <span
        className={cn(
          "h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
          TONE_CLASS[meta.tone],
        )}
      >
        <Icon size={12} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[11.5px] font-bold text-ink truncate leading-tight">
          {item.summary}
        </div>
        {/* v0.6.17: компактная разбивка diff — добавленные/убранные позиции,
            суммы доплат. Чипы небольшие, в одну-две строки. */}
        {chips.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {chips.map((c, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded-md text-[10px] font-bold tabular-nums whitespace-nowrap",
                  c.tone === "add" && "bg-emerald-100 text-emerald-700",
                  c.tone === "remove" && "bg-red-soft text-red-ink line-through decoration-red-ink/40",
                  c.tone === "money-up" && "bg-emerald-100 text-emerald-700",
                  c.tone === "money-down" && "bg-red-soft text-red-ink",
                )}
              >
                {c.label}
              </span>
            ))}
          </div>
        )}
        <div className="text-[10px] text-muted tabular-nums leading-tight mt-0.5">
          {new Date(item.createdAt).toLocaleString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {item.userName && item.userName !== "система" && (
            <>
              <span className="opacity-40"> · </span>
              <span>{item.userName}</span>
            </>
          )}
        </div>
      </div>
      {amount != null && amount !== 0 && (
        <div
          className={cn(
            "shrink-0 font-display text-[12.5px] font-extrabold tabular-nums mt-0.5",
            positive ? "text-green-ink" : "text-red-ink",
          )}
        >
          {positive ? "+" : ""}
          {amount.toLocaleString("ru-RU")} ₽
        </div>
      )}
    </div>
  );
}

/**
 * v0.6.17: собираем компактные «чипы» из diff'а:
 *   • kind='list' → «+ X» (added) / «− X» (removed); kept не показываем
 *   • kind='money' → «+N ₽» зелёным если to>from, «−N ₽» красным
 *   • kind='number' → «+N suffix» / «−N suffix»
 */
function collectDiffChips(
  diff: DiffPayload,
): Array<{ label: string; tone: "add" | "remove" | "money-up" | "money-down" }> {
  const out: Array<{ label: string; tone: "add" | "remove" | "money-up" | "money-down" }> = [];
  for (const key of Object.keys(diff)) {
    const f = diff[key];
    if (!f) continue;
    if (f.kind === "list") {
      const from = (Array.isArray(f.from) ? f.from : []).map(String);
      const to = (Array.isArray(f.to) ? f.to : []).map(String);
      const fromSet = new Set(from);
      const toSet = new Set(to);
      const removed = from.filter((x) => !toSet.has(x));
      const added = to.filter((x) => !fromSet.has(x));
      for (const x of added) out.push({ label: `+ ${x}`, tone: "add" });
      for (const x of removed) out.push({ label: x, tone: "remove" });
    } else if (f.kind === "money") {
      const fromN = typeof f.from === "number" ? f.from : 0;
      const toN = typeof f.to === "number" ? f.to : 0;
      const delta = toN - fromN;
      if (delta === 0) continue;
      const sign = delta > 0 ? "+" : "−";
      out.push({
        label: `${sign}${Math.abs(delta).toLocaleString("ru-RU")} ₽`,
        tone: delta > 0 ? "money-up" : "money-down",
      });
    } else if (f.kind === "number") {
      const fromN = typeof f.from === "number" ? f.from : 0;
      const toN = typeof f.to === "number" ? f.to : 0;
      const delta = toN - fromN;
      if (delta === 0) continue;
      const sign = delta > 0 ? "+" : "−";
      const suffix = f.suffix ? ` ${f.suffix}` : "";
      out.push({
        label: `${sign}${Math.abs(delta).toLocaleString("ru-RU")}${suffix}`,
        tone: delta > 0 ? "money-up" : "money-down",
      });
    }
  }
  // Ограничим длину, чтобы строка не разрасталась — оператор может
  // открыть «всю историю» для подробностей.
  return out.slice(0, 6);
}

/** Извлекает сумму из activity item для отображения справа. */
function extractAmount(item: ApiActivityItem): number | null {
  const payload = (item as { payload?: unknown }).payload;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.amount === "number") return obj.amount;
    if (typeof obj.sum === "number") return obj.sum;
    if (typeof obj.value === "number") return obj.value;
  }
  // v0.6.17: meta.amount тоже считается (backend пишет туда сумму платежа).
  const meta = (item.meta ?? null) as Record<string, unknown> | null;
  if (meta) {
    if (typeof meta.amount === "number") return meta.amount;
  }
  return null;
}
