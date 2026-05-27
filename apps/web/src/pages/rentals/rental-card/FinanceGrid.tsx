/**
 * FinanceGrid — блок «Финансы по аренде» (1 ряд из 4 ячеек) для левой
 * колонки карточки аренды v0.6.39.
 *
 * Ячейки (слева направо):
 *   • Просрочка (дни)         — красный фон, дата начала просрочки
 *   • Долг (₽)                — красный фон, totalDebt по аренде
 *   • Оплачено (₽)            — нейтральный, lastSegmentSum
 *   • За всё время (₽)        — нейтральный, paidIn по клиенту
 *
 * Кнопка «Подробнее →» в header'е открывает DebtsList drawer.
 * Бизнес-логика totalDebt / lastSegmentSum / paidIn не пересчитывается.
 */
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { Rental, RentalStatus } from "@/lib/mock/rentals";
import type { DebtSummary } from "@/lib/api/debt";

type Tone = "red" | "neutral" | "blue";

function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "0";
  return n.toLocaleString("ru-RU");
}

function parseDate(s: string): Date | null {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]);
}

function daysBetween(a: Date, b: Date): number {
  const aD = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bD = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((bD - aD) / 86400000);
}

export function FinanceGrid({
  rental,
  debtSummary,
  paidIn,
  pending,
  totalDamageDebt,
  effectiveStatus,
  lastSegmentSum,
  lastPaidAt,
  onOverdueClick,
  onOpenDebts,
}: {
  rental: Rental;
  debtSummary: DebtSummary | undefined;
  paidIn: number;
  pending: number;
  totalDamageDebt: number;
  effectiveStatus: RentalStatus;
  lastSegmentSum: number;
  /** v0.6.39: ISO/строка даты последнего оплаченного rent-платежа —
   *  если есть, идёт сабпись в ячейке «Оплачено» как «последний платёж DD.MM». */
  lastPaidAt?: string | null;
  onOverdueClick?: (rect: DOMRect) => void;
  onOpenDebts: () => void;
}) {
  const isOverdue = effectiveStatus === "overdue";
  const endDate = parseDate(rental.endPlanned);
  const today = new Date();
  const overdueDays =
    isOverdue && endDate ? Math.abs(daysBetween(today, endDate)) : 0;

  const overdueBalance = debtSummary?.overdueBalance ?? 0;
  const manualBalance = debtSummary?.manualBalance ?? 0;
  const damageBalance = debtSummary?.damageBalance ?? totalDamageDebt;
  const totalDebt = pending + overdueBalance + damageBalance + manualBalance;

  // «платёж DD.MM» — если есть оплаченный платёж сегмента.
  let lastPaidLabel: string | null = null;
  if (lastPaidAt) {
    const d = new Date(lastPaidAt);
    if (!Number.isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      lastPaidLabel = `платёж ${dd}.${mm}`;
    }
  }

  return (
    <div className="rounded-2xl bg-surface border border-border shadow-card-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="text-[13px] font-semibold text-ink">
          Финансы по аренде
        </div>
        <button
          type="button"
          onClick={onOpenDebts}
          className="inline-flex items-center gap-1 rounded-full bg-surface-soft hover:bg-ink hover:text-white px-2 py-0.5 text-[10.5px] font-bold text-ink-2 transition-colors"
        >
          Подробнее <ArrowRight size={10} />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2 px-4 pb-4">
        <FinCell
          label="Просрочка"
          value={overdueDays > 0 ? `${overdueDays} дн` : "—"}
          sub={
            isOverdue && endDate
              ? `с ${rental.endPlanned.slice(0, 5)}`
              : "нет"
          }
          tone={overdueDays > 0 ? "red" : "neutral"}
          onClick={
            overdueDays > 0 && onOverdueClick
              ? (rect) => onOverdueClick(rect)
              : undefined
          }
        />
        <FinCell
          label="Долг"
          value={`${fmt(totalDebt)} ₽`}
          sub={totalDebt > 0 ? "дни + штраф" : "нет"}
          tone={totalDebt > 0 ? "red" : "neutral"}
          icon={totalDebt > 0 ? AlertTriangle : undefined}
          onClick={
            totalDebt > 0
              ? onOverdueClick
                ? (rect) => onOverdueClick(rect)
                : () => onOpenDebts()
              : undefined
          }
        />
        <FinCell
          label="Оплачено"
          value={`${fmt(lastSegmentSum)} ₽`}
          sub={lastPaidLabel ?? "текущий сегмент"}
          tone="neutral"
        />
        <FinCell
          label="За всё время"
          value={`${fmt(paidIn)} ₽`}
          sub="всех аренд клиента"
          tone="blue"
        />
      </div>
    </div>
  );
}

function FinCell({
  label,
  value,
  sub,
  tone,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: Tone;
  icon?: typeof AlertTriangle;
  onClick?: (rect: DOMRect) => void;
}) {
  const toneStyles: Record<Tone, { bg: string; text: string; sub: string; border: string }> = {
    neutral: {
      bg: "bg-surface-soft",
      text: "text-ink",
      sub: "text-muted",
      border: "border-border",
    },
    blue: {
      bg: "bg-surface-soft",
      text: "text-blue-700",
      sub: "text-muted",
      border: "border-border",
    },
    red: {
      bg: "bg-red-soft/60",
      text: "text-red-ink",
      sub: "text-red-ink/80",
      border: "border-red-200",
    },
  };
  const t = toneStyles[tone];
  const Component = onClick ? "button" : "div";
  return (
    <Component
      type={onClick ? ("button" as const) : undefined}
      onClick={
        onClick
          ? (e: React.MouseEvent<HTMLElement>) =>
              onClick((e.currentTarget as HTMLElement).getBoundingClientRect())
          : undefined
      }
      className={`relative rounded-[10px] border ${t.border} px-3 py-2.5 text-left min-w-0 w-full ${t.bg} ${onClick ? "hover:brightness-95 cursor-pointer" : ""}`}
    >
      <div className="flex items-center gap-1 text-[10.5px] font-semibold text-muted-2 truncate">
        {Icon && <Icon size={10} className="text-red-ink" />}
        {label}
      </div>
      <div
        className={`mt-1 font-display text-[19px] font-bold tabular-nums leading-tight truncate ${t.text}`}
      >
        {value}
      </div>
      {sub && (
        <div
          className={`mt-0.5 text-[10px] leading-tight whitespace-normal break-words ${t.sub}`}
        >
          {sub}
        </div>
      )}
    </Component>
  );
}
