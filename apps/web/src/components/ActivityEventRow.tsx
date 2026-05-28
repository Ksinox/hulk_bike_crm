/**
 * ActivityEventRow — единый визуальный рендер события activity-журнала
 * во всей CRM (v0.7.15). Раньше визуальный формат «было → стало» жил
 * только локально в RentalCardTabs.tsx (ActivityVisualRow). Теперь вынесен
 * сюда и применяется везде, где показывается лента действий: дашборд
 * («Последние действия» / «Весь журнал»), inline-история под календарём
 * аренды, лента событий в карточках аренды / клиента / скутера.
 *
 * Единый визуальный язык:
 *   • круглая иконка типа события (цвет по тону);
 *   • основное «было → стало» — две пилюли + стрелка;
 *   • строки-последствия (доплата, новая сумма аренды, пробег);
 *   • дата/время + автор.
 *
 * Режим compact (дашборд, inline-история): иконка + краткое «было → стало»
 * в одну строку + дата. Без строк-последствий — минимально плотно.
 */
import {
  AlertTriangle,
  ArrowRight,
  Bike,
  CheckCircle2,
  Clock,
  FileText,
  Gift,
  HardHat,
  Pencil,
  Repeat,
  RotateCcw,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApiActivityItem } from "@/lib/api/activity";

/* ============================ Категории / фильтры ============================ */

export type ActivityCategory = "extend" | "swap" | "equipment" | "money";

/** Маппинг action → категория фильтра (используется в полной ленте). */
export function actionCategory(action: string): ActivityCategory | null {
  if (action.includes("extend")) return "extend";
  if (action.includes("scooter_swap") || action === "scooter_swapped")
    return "swap";
  if (action.includes("equipment")) return "equipment";
  if (
    action.includes("payment") ||
    action.includes("paid") ||
    action.includes("debt") ||
    action.includes("overdue") ||
    action.includes("forgiv") ||
    action.includes("damage") ||
    action.includes("refund") ||
    action.includes("security")
  )
    return "money";
  return null;
}

/* ============================ Иконки / тона ============================ */

type EventTone = "green" | "red" | "blue" | "orange" | "ink" | "amber";

const EVENT_TONE_CLASS: Record<EventTone, string> = {
  green: "bg-green-soft text-green-ink",
  red: "bg-red-soft text-red-ink",
  blue: "bg-blue-50 text-blue-700",
  orange: "bg-orange-soft text-orange-ink",
  amber: "bg-amber-100 text-amber-800",
  ink: "bg-surface-soft text-ink-2",
};

function eventVisual(action: string): { icon: LucideIcon; tone: EventTone } {
  if (action.includes("equipment")) return { icon: HardHat, tone: "orange" };
  if (action.includes("scooter_swap") || action === "scooter_swapped")
    return { icon: Bike, tone: "ink" };
  if (action.includes("extend")) return { icon: Repeat, tone: "blue" };
  if (action === "created" || action.includes("activate"))
    return { icon: Sparkles, tone: "blue" };
  if (action.includes("forgiv")) return { icon: Gift, tone: "green" };
  if (
    action.includes("payment") ||
    action.includes("paid") ||
    action === "debt_payment"
  )
    return { icon: Wallet, tone: "green" };
  if (action.includes("refund") || action.includes("security"))
    return { icon: RotateCcw, tone: "green" };
  if (action.includes("damage")) return { icon: AlertTriangle, tone: "amber" };
  if (action.includes("debt") || action.includes("overdue"))
    return { icon: AlertTriangle, tone: "red" };
  if (action.includes("document")) return { icon: FileText, tone: "blue" };
  if (action.includes("status") || action.includes("complet"))
    return { icon: CheckCircle2, tone: "ink" };
  if (action.includes("archived") || action.includes("deleted"))
    return { icon: X, tone: "ink" };
  return { icon: Pencil, tone: "ink" };
}

export function entityLabel(entity: string): string {
  switch (entity) {
    case "rental":
      return "аренда";
    case "scooter":
      return "скутер";
    case "client":
      return "клиент";
    case "damage_report":
      return "акт ущерба";
    case "payment":
      return "платёж";
    case "repair_job":
      return "ремонт";
    case "user":
      return "пользователь";
    default:
      return entity;
  }
}

/* ============================ Разбор meta.diff ============================ */

type ChangeView = {
  from?: string | null;
  to?: string | null;
  tone?: "blue" | "green" | "red";
};

export type ActivitySummaryView = {
  title: string;
  change: ChangeView | null;
  extras: string[];
};

/**
 * Разбирает событие в визуальную форму:
 *   • title  — короткий заголовок («Изменена экипировка»),
 *   • change — основное «было → стало» (две пилюли + стрелка),
 *   • extras — доп. последствия одной строкой (доплата, новая сумма).
 * Берёт структурированный meta.diff (см. apps/api/.../activityLog.ts).
 */
export function formatActivitySummary(
  item: ApiActivityItem,
): ActivitySummaryView {
  const action = item.action;
  const diff = readRecord(readRecord(item.meta)?.diff);
  const money = (v: unknown): string =>
    `${Number(v ?? 0).toLocaleString("ru-RU")} ₽`;
  const fee = readRecord(diff?.fee);
  const feeLine = (): string | null => {
    if (!fee) return null;
    const label = typeof fee.label === "string" ? fee.label : "Доплата";
    return `${label}: ${money(fee.to)}`;
  };

  // ── Экипировка ──
  if (action.includes("equipment")) {
    const eq = readRecord(diff?.items);
    const from = readStringList(eq?.from);
    const to = readStringList(eq?.to);
    const added = to.filter((n) => !from.includes(n));
    const removed = from.filter((n) => !to.includes(n));
    const extras: string[] = [];
    const fl = feeLine();
    if (fl) extras.push(fl);
    // замена 1↔1
    if (added.length === 1 && removed.length === 1) {
      return {
        title: "Заменена экипировка",
        change: { from: removed[0], to: added[0], tone: "blue" },
        extras,
      };
    }
    if (added.length > 0 && removed.length === 0) {
      return {
        title: "Добавлена экипировка",
        change: { from: "—", to: added.join(", "), tone: "green" },
        extras,
      };
    }
    if (removed.length > 0 && added.length === 0) {
      return {
        title: "Убрана экипировка",
        change: { from: removed.join(", "), to: "—", tone: "red" },
        extras,
      };
    }
    return {
      title: "Изменена экипировка",
      change: {
        from: from.length ? from.join(", ") : "—",
        to: to.length ? to.join(", ") : "—",
        tone: "blue",
      },
      extras,
    };
  }

  // ── Замена скутера ──
  if (action.includes("scooter_swap") || action === "scooter_swapped") {
    const sc = readRecord(diff?.scooter);
    const from = typeof sc?.from === "string" ? sc.from : null;
    const to = typeof sc?.to === "string" ? sc.to : null;
    const extras: string[] = [];
    const fl = feeLine();
    if (fl) extras.push(fl);
    return {
      title: "Замена скутера",
      change: from || to ? { from, to, tone: "blue" } : null,
      extras,
    };
  }

  // ── Продление ──
  if (action.includes("extend")) {
    const days = readRecord(diff?.days);
    const extras: string[] = [];
    let change: ChangeView | null = null;
    if (days && typeof days.from === "number" && typeof days.to === "number") {
      const delta = days.to - days.from;
      change = {
        from: `${days.from} дн`,
        to: `${days.to} дн${delta > 0 ? ` (+${delta})` : ""}`,
        tone: "blue",
      };
    } else if (days && typeof days.to === "number") {
      change = { from: "—", to: `${days.to} дн`, tone: "blue" };
    }
    const sum = readRecord(diff?.sum);
    if (sum && (sum.from != null || sum.to != null)) {
      extras.push(`Сумма аренды: ${money(sum.from)} → ${money(sum.to)}`);
    }
    const fl = feeLine();
    if (fl) extras.push(fl);
    return { title: "Продление аренды", change, extras };
  }

  // ── Платёж ──
  if (
    action.includes("payment") ||
    action.includes("paid") ||
    action === "debt_payment"
  ) {
    const pay = readRecord(diff?.payment);
    const amount = pay?.to ?? readRecord(item.meta)?.amount;
    return {
      title: "Принят платёж",
      change:
        amount != null
          ? { from: null, to: money(amount), tone: "green" }
          : null,
      extras: [],
    };
  }

  // ── Прощение долга ──
  if (action.includes("forgiv")) {
    const key = ["fine", "debt", "overdueDays"].find((k) => diff?.[k]);
    const f = key ? readRecord(diff?.[key]) : null;
    return {
      title: "Долг прощён",
      change: f ? { from: money(f.from), to: "0 ₽", tone: "green" } : null,
      extras: [],
    };
  }

  // ── Начисление долга / ущерб / просрочка ──
  if (
    action.includes("debt") ||
    action.includes("overdue") ||
    action.includes("damage")
  ) {
    const key = ["debt", "damage", "fine"].find((k) => diff?.[k]);
    const d = key ? readRecord(diff?.[key]) : null;
    const title = action.includes("damage")
      ? "Зафиксирован ущерб"
      : "Начислен долг";
    return {
      title,
      change: d ? { from: "—", to: money(d.to), tone: "red" } : null,
      extras: [],
    };
  }

  // ── Завершение / возврат завершения / статус ──
  if (action.includes("complet") || action.includes("status")) {
    const st = readRecord(diff?.status);
    const fromS = typeof st?.from === "string" ? statusLabel(st.from) : null;
    const toS = typeof st?.to === "string" ? statusLabel(st.to) : null;
    const extras: string[] = [];
    const mileage = readRecord(diff?.mileage);
    if (mileage && mileage.from != null && mileage.to != null) {
      extras.push(
        `Пробег: ${Number(mileage.from).toLocaleString("ru-RU")} → ${Number(
          mileage.to,
        ).toLocaleString("ru-RU")} км`,
      );
    }
    return {
      title: "Изменён статус",
      change: fromS || toS ? { from: fromS, to: toS, tone: "blue" } : null,
      extras,
    };
  }

  // ── Создание ──
  if (action === "created" && item.entity === "rental") {
    return { title: "Аренда создана", change: null, extras: [] };
  }

  // ── Редактирование (есть diff, но не покрыто выше) ──
  const keys = Object.keys(diff ?? {});
  if (keys.length > 0) {
    const extras = keys
      .map((k) => {
        const f = readRecord(diff?.[k]);
        if (!f || typeof f.label !== "string") return null;
        return `${f.label}: ${String(f.from ?? "—")} → ${String(f.to ?? "—")}`;
      })
      .filter((x): x is string => x != null)
      .slice(0, 4);
    return { title: "Изменена аренда", change: null, extras };
  }

  // ── Fallback — короткий заголовок без «#N · Имя · Модель» ──
  return { title: shortSummary(item.summary), change: null, extras: [] };
}

/** Короткий заголовок из summary — режем хвост «по аренде #N · Имя · Модель». */
function shortSummary(summary: string): string {
  let s = summary || "";
  s = s.replace(/\s+по\s+аренде\s+#?\d+(?:\s.*)?$/i, "");
  s = s.replace(/\s+по\s+скутеру\s+#?\d+(?:\s.*)?$/i, "");
  s = s.replace(/\s*[·•|]\s*Аренда\s+#?\d+.*$/i, "");
  s = s.replace(/\s*[·•|]\s*(?:Jog|Gear)[^·•|]*$/i, "");
  s = s.replace(
    /\s*[·•|]\s*[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)+(?=\s*(?:[·•|]|$))/g,
    "",
  );
  return s.trim() || summary;
}

function statusLabel(s: string): string {
  switch (s) {
    case "active":
      return "активна";
    case "completed":
      return "завершена";
    case "reserved":
      return "бронь";
    default:
      return s;
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      )
    : [];
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTimeShort(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ============================ Пилюля «было → стало» ============================ */

function ChangePills({
  change,
  size = "md",
}: {
  change: ChangeView;
  size?: "sm" | "md";
}) {
  const fromText =
    size === "sm"
      ? "rounded bg-white px-1 py-px text-[10.5px] font-semibold text-muted-2 line-through ring-1 ring-inset ring-border"
      : "rounded-md bg-white px-1.5 py-0.5 font-semibold text-muted-2 line-through ring-1 ring-inset ring-border";
  const toBase =
    size === "sm"
      ? "rounded px-1 py-px text-[10.5px] font-bold ring-1 ring-inset"
      : "rounded-md px-1.5 py-0.5 font-bold ring-1 ring-inset";
  const toTone =
    change.tone === "red"
      ? "bg-red-soft text-red-ink ring-red-soft"
      : change.tone === "green"
        ? "bg-green-soft text-green-ink ring-green-soft"
        : "bg-blue-50 text-blue-700 ring-blue-200";
  return (
    <>
      {change.from != null && <span className={fromText}>{change.from}</span>}
      {change.from != null && change.to != null && (
        <ArrowRight size={size === "sm" ? 10 : 12} className="text-muted-2" />
      )}
      {change.to != null && (
        <span className={cn(toBase, toTone)}>{change.to}</span>
      )}
    </>
  );
}

/* ============================ Основной компонент ============================ */

export function ActivityEventRow({
  item,
  clickable = false,
  onOpen,
  compact = false,
}: {
  item: ApiActivityItem;
  /** Кликабельна ли строка (открыть связанную сущность). */
  clickable?: boolean;
  onOpen?: () => void;
  /** Плотный режим: одна строка, без extras (дашборд, inline-история). */
  compact?: boolean;
}) {
  const vis = eventVisual(item.action);
  const Icon = vis.icon;
  const view = formatActivitySummary(item);
  const interactive = clickable && !!onOpen;

  if (compact) {
    return (
      <button
        type="button"
        onClick={onOpen}
        disabled={!interactive}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-left transition-colors",
          "hover:bg-surface-soft",
          interactive ? "cursor-pointer" : "cursor-default",
        )}
        title={
          interactive ? `Открыть ${entityLabel(item.entity)}` : undefined
        }
      >
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            EVENT_TONE_CLASS[vis.tone],
          )}
        >
          <Icon size={12} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-bold leading-tight text-ink">
            {view.title}
          </div>
          {view.change && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1 leading-tight">
              <ChangePills change={view.change} size="sm" />
            </div>
          )}
          <div className="mt-0.5 text-[10px] leading-tight text-muted tabular-nums">
            {formatDateTimeShort(item.createdAt)}
            {item.userName && item.userName !== "система" && (
              <>
                <span className="opacity-40"> · </span>
                <span>{item.userName}</span>
              </>
            )}
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!interactive}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-[12px] px-3 py-2.5 text-left transition-colors",
        "bg-surface-soft hover:bg-blue-50",
        interactive ? "cursor-pointer" : "cursor-default",
      )}
      title={interactive ? `Открыть ${entityLabel(item.entity)}` : undefined}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          EVENT_TONE_CLASS[vis.tone],
        )}
      >
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold leading-snug text-ink">
          {view.title}
        </div>
        {/* основное «было → стало» */}
        {view.change && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] leading-snug">
            <ChangePills change={view.change} size="md" />
          </div>
        )}
        {/* доп. строки последствий (доплата, новая сумма аренды и т.п.) */}
        {view.extras.length > 0 && (
          <div className="mt-1 flex flex-col gap-0.5">
            {view.extras.map((ex, i) => (
              <div key={i} className="text-[11.5px] font-semibold text-ink-2">
                {ex}
              </div>
            ))}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-2">
          <Clock size={10} />
          {formatDateTime(item.createdAt)}
          {item.userName && item.userName !== "система" && (
            <>
              <span className="opacity-40">·</span>
              <span>{item.userName}</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}
