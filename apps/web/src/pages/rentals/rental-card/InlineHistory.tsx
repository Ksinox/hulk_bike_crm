/**
 * InlineHistory — компактная подсказка «последние события» под календарём
 * в карточке аренды v0.6.38. Показывает 3-5 строк, кнопка «Все события →»
 * открывает полный SideDrawer (история).
 *
 * Использует тот же ApiActivityItem что и HistoryStrip / ActivityFeed,
 * чтобы не дублировать бизнес-логику. Дизайн — мелкие строки с иконкой,
 * summary и временем.
 */
import { ArrowRight, History } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApiActivityItem } from "@/lib/api/activity";
import {
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

type Tone = "green" | "red" | "blue" | "orange" | "ink";

const TONE_CLASS: Record<Tone, string> = {
  green: "bg-green-soft text-green-ink",
  red: "bg-red-soft text-red-ink",
  blue: "bg-blue-50 text-blue-700",
  orange: "bg-orange-soft text-orange-ink",
  ink: "bg-surface-soft text-ink-2",
};

function actionMeta(action: string): { icon: LucideIcon; tone: Tone } {
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
  if (
    action === "document_saved" ||
    action === "document_downloaded" ||
    action === "document_printed" ||
    action === "document_snapshot_deleted" ||
    action.includes("document")
  ) {
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

export function InlineHistory({
  items,
  loading,
  onExpand,
  limit = 5,
}: {
  items: ApiActivityItem[];
  loading?: boolean;
  onExpand: () => void;
  limit?: number;
}) {
  return (
    <div className="rounded-2xl bg-surface border border-border shadow-card-sm overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-muted-2 inline-flex items-center gap-1.5">
            <History size={11} /> Последние события
          </div>
        </div>
        <button
          type="button"
          onClick={onExpand}
          className="inline-flex items-center gap-1 rounded-full bg-surface-soft hover:bg-ink hover:text-white px-2.5 py-1 text-[11px] font-bold text-ink-2 shrink-0 transition-colors"
        >
          Все события <ArrowRight size={11} />
        </button>
      </div>
      <div>
        {loading ? (
          <div className="px-4 py-4 text-[12px] text-muted">Загружаем…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-4 text-[12px] text-muted">
            Событий ещё нет. Они появятся автоматически по мере работы с арендой.
          </div>
        ) : (
          <div className="px-3 py-2 flex flex-col gap-1">
            {items.slice(0, limit).map((it) => (
              <InlineRow key={it.id} item={it} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * v0.6.39: формирует короткий текст для inline-строки.
 * Полный summary с сервера обычно выглядит как:
 *   «Изменена экипировка по аренде #6 · Гамадов Недир · Jog #02»
 * В контексте текущей карточки префикс «по аренде #N · {имя} · {модель}»
 * избыточен — пользователь уже знает где находится. Отрезаем всё после
 * первого « по аренде #» / « по скутеру #» / « · Аренда #» — оставляем
 * только заголовок действия.
 */
function formatActivityShort(item: ApiActivityItem): string {
  let s = item.summary || "";
  // v0.6.40: точечные регексы — режем только «избыточные» хвосты,
  // полезный контекст («Шлем на голову» и т.п.) сохраняется.
  // 1) «по аренде #N ...» / «по скутеру #N ...»
  s = s.replace(/\s+по\s+аренде\s+#?\d+(?:\s.*)?$/i, "");
  s = s.replace(/\s+по\s+скутеру\s+#?\d+(?:\s.*)?$/i, "");
  // 2) «· Аренда #N ...» (любой хвост после)
  s = s.replace(/\s*[·•|]\s*Аренда\s+#?\d+.*$/i, "");
  // 3) «· Jog #X ...» / «· Gear #X ...» — модель скутера
  s = s.replace(/\s*[·•|]\s*(?:Jog|Gear)[^·•|]*$/i, "");
  // 4) «· Имя Фамилия» (две слова с заглавной кириллицей) — режем
  //    только если стоит в конце или перед другим «·».
  s = s.replace(
    /\s*[·•|]\s*[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)+(?=\s*(?:[·•|]|$))/g,
    "",
  );
  return s.trim();
}

function InlineRow({ item }: { item: ApiActivityItem }) {
  const meta = actionMeta(item.action);
  const Icon = meta.icon;
  const amount = extractAmount(item);
  const positive = amount != null && amount > 0;
  const shortText = formatActivityShort(item);
  // v0.6.53: вытаскиваем структурированный diff (было → стало) из
  // meta.diff (API логирует через logActivity({diff})). Используется
  // для замены экипировки / скутера / редактирования аренды и т.п.
  const diffLine = renderDiffLine(item);
  return (
    <div className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-[10px] hover:bg-surface-soft">
      <span
        className={cn(
          "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
          TONE_CLASS[meta.tone],
        )}
      >
        <Icon size={12} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[11.5px] font-bold text-ink truncate leading-tight">
          {shortText}
        </div>
        {diffLine && (
          <div className="text-[10.5px] text-muted-2 truncate leading-tight mt-0.5">
            {diffLine}
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
            "shrink-0 font-display text-[12.5px] font-extrabold tabular-nums",
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
 * v0.6.53: рендер «было → стало» из meta.diff.
 *
 * Бэкенд (apps/api/src/services/activityLog.ts) пишет в meta.diff поля
 * `from`/`to` с типом DiffFieldKind (money/date/list/text/number). Здесь
 * мы достаём нужное поле по action и форматируем одной строкой.
 *
 *  • equipment_changed → meta.diff.items {from: string[], to: string[]}
 *  • scooter_swapped   → meta.diff.scooter {from: string, to: string}
 *  • rental_extended   → meta.diff.days {to: число}  → «+N дней»
 *  • payment_*         → handled через extractAmount (не нужен diff)
 *
 * Если нет diff'а — возвращаем null, строка не показывается.
 */
function renderDiffLine(item: ApiActivityItem): string | null {
  const meta = (item.meta ?? null) as Record<string, unknown> | null;
  const diff = meta && typeof meta === "object" ? (meta.diff as Record<string, { from?: unknown; to?: unknown; kind?: string }> | undefined) : undefined;
  if (!diff) return null;
  // Замена экипировки
  if (diff.items && (Array.isArray(diff.items.from) || Array.isArray(diff.items.to))) {
    const from = Array.isArray(diff.items.from) ? (diff.items.from as string[]) : [];
    const to = Array.isArray(diff.items.to) ? (diff.items.to as string[]) : [];
    // Найдём дельту: что было «заменено» (наиболее частый кейс — один в один).
    const added = to.filter((n) => !from.includes(n));
    const removed = from.filter((n) => !to.includes(n));
    if (added.length === 1 && removed.length === 1) {
      return `${removed[0]} → ${added[0]}`;
    }
    if (added.length > 0 && removed.length === 0) {
      return `+ ${added.join(", ")}`;
    }
    if (removed.length > 0 && added.length === 0) {
      return `− ${removed.join(", ")}`;
    }
    return `${from.join(", ") || "—"} → ${to.join(", ") || "—"}`;
  }
  // Замена скутера
  if (diff.scooter && typeof diff.scooter.from === "string" && typeof diff.scooter.to === "string") {
    return `${diff.scooter.from} → ${diff.scooter.to}`;
  }
  // Продление: meta.diff.days = {to: число дней extraDays}
  if (diff.days && typeof diff.days.to === "number") {
    const n = diff.days.to as number;
    return `+${n} ${n === 1 ? "день" : n < 5 ? "дня" : "дней"}`;
  }
  // Редактирование аренды: множество полей diff → перечисляем подписи.
  const keys = Object.keys(diff);
  if (keys.length > 0) {
    const labels = keys
      .map((k) => (diff[k] as { label?: string } | undefined)?.label)
      .filter(Boolean) as string[];
    if (labels.length > 0 && labels.length <= 4) {
      return labels.join(", ");
    }
  }
  return null;
}

function extractAmount(item: ApiActivityItem): number | null {
  const payload = (item as { payload?: unknown }).payload;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.amount === "number") return obj.amount;
    if (typeof obj.sum === "number") return obj.sum;
    if (typeof obj.value === "number") return obj.value;
  }
  const meta = (item.meta ?? null) as Record<string, unknown> | null;
  if (meta) {
    if (typeof meta.amount === "number") return meta.amount;
  }
  return null;
}
