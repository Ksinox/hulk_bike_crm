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
  CreditCard,
  AlertTriangle,
  Repeat,
  Edit,
  Plus,
  Check,
  X,
  Trash2,
  Wrench,
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

function actionMeta(action: string): { icon: LucideIcon; tone: Tone } {
  if (action.includes("paid") || action === "payment_accepted") {
    return { icon: CreditCard, tone: "green" };
  }
  if (action.includes("forgiv")) {
    return { icon: Check, tone: "green" };
  }
  if (action.includes("extended") || action === "extended") {
    return { icon: Repeat, tone: "blue" };
  }
  if (action.includes("created") || action === "activate" || action === "activated") {
    return { icon: Plus, tone: "blue" };
  }
  if (action.includes("damage")) {
    return { icon: Wrench, tone: "orange" };
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
    return { icon: Edit, tone: "ink" };
  }
  return { icon: Edit, tone: "ink" };
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

function HistoryStripRow({ item }: { item: ApiActivityItem }) {
  const meta = actionMeta(item.action);
  const Icon = meta.icon;
  const amount = extractAmount(item);
  const positive = amount != null && amount > 0;
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
          {item.summary}
        </div>
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

/** Извлекает сумму из activity item для отображения справа. */
function extractAmount(item: ApiActivityItem): number | null {
  const payload = (item as { payload?: unknown }).payload;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.amount === "number") return obj.amount;
    if (typeof obj.sum === "number") return obj.sum;
    if (typeof obj.value === "number") return obj.value;
  }
  return null;
}
