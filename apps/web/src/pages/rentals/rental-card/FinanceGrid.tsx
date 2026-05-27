/**
 * FinanceGrid — блок «Финансы по аренде» (2×2 ячейки) для левой колонки
 * карточки аренды v0.6.38. Заменяет горизонтальный KpiStrip.
 *
 * Ячейки:
 *   • Просрочка (дни)         — красный, кликабельный → onOverdueClick
 *   • Долг (₽)                — красный, кликабельный → onOverdueClick
 *   • Оплачено (₽)            — зелёный, lastSegmentSum (эта аренда)
 *   • За всё время (₽)        — синий, paidIn (по всему клиенту)
 *
 * Под сеткой — кнопка «Подробнее →» открывает DebtsList drawer.
 * Бизнес-логика не пересчитывается, только presentation.
 */
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { Rental, RentalStatus } from "@/lib/mock/rentals";
import type { DebtSummary } from "@/lib/api/debt";

type Tone = "ink" | "blue" | "red" | "green";

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

  return (
    <div className="rounded-2xl bg-surface border border-border shadow-card-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
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
      <div className="grid grid-cols-2 divide-x divide-y divide-border border-t border-border">
        <FinCell
          label="Просрочка"
          value={overdueDays > 0 ? `${overdueDays} дн` : "—"}
          sub={isOverdue && endDate ? `с ${rental.endPlanned.slice(0, 5)}` : "нет"}
          tone={overdueDays > 0 ? "red" : "ink"}
          onClick={
            overdueDays > 0 && onOverdueClick
              ? (rect) => onOverdueClick(rect)
              : undefined
          }
        />
        <FinCell
          label="Долг"
          value={`${fmt(totalDebt)} ₽`}
          sub={totalDebt > 0 ? "к погашению" : "нет"}
          tone={totalDebt > 0 ? "red" : "ink"}
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
          label="Эта аренда"
          value={`${fmt(lastSegmentSum)} ₽`}
          sub="сумма текущего сегмента"
          tone="ink"
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
  const toneStyles: Record<Tone, { bg: string; text: string; sub: string }> = {
    ink: { bg: "bg-transparent", text: "text-ink", sub: "text-muted" },
    blue: { bg: "bg-transparent", text: "text-blue-700", sub: "text-muted" },
    red: { bg: "bg-red-soft/60", text: "text-red-ink", sub: "text-red-ink/80" },
    green: { bg: "bg-transparent", text: "text-green-ink", sub: "text-muted" },
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
      className={`relative px-3 py-2.5 text-left min-w-0 w-full ${t.bg} ${onClick ? "hover:brightness-95 cursor-pointer" : ""}`}
    >
      <div className="flex items-center gap-1 text-[9.5px] uppercase tracking-wider font-bold text-muted-2 truncate">
        {Icon && <Icon size={10} className="text-red-ink" />}
        {label}
      </div>
      <div
        className={`mt-0.5 font-display text-[15px] font-extrabold tabular-nums leading-tight truncate ${t.text}`}
      >
        {value}
      </div>
      {sub && <div className={`mt-0.5 text-[10px] truncate ${t.sub}`}>{sub}</div>}
    </Component>
  );
}
