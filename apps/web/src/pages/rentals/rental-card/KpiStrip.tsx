/**
 * KpiStrip — горизонтальная панель KPI карточки аренды:
 *   • [Просрочка / Срок]
 *   • [Эта аренда]
 *   • [За всё время]
 *   • [Долг (если > 0)]
 *   + кнопки «Принять оплату» / «Завершить»
 *
 * Цвета и компактная плотность подобраны под дизайн v0.6
 * (см. design/claude-design/Hulk Bike CRM/rental-card.jsx ~258-340).
 */
import type React from "react";
import { AlertTriangle, Check, Wallet } from "lucide-react";
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

export function KpiStrip({
  rental,
  debtSummary,
  paidIn,
  pending,
  totalDamageDebt,
  effectiveStatus,
  extensionsCount,
  canAcceptPayment,
  canComplete,
  onAcceptPayment,
  onComplete,
  onOpenDebts,
  onOverdueClick,
}: {
  rental: Rental;
  debtSummary: DebtSummary | undefined;
  /** «За всё время аренды» — сумма всех оплаченных не-залоговых платежей */
  paidIn: number;
  /** Неоплаченные платежи по аренде */
  pending: number;
  /** Долг по ущербу (sum по damage_reports.debt) */
  totalDamageDebt: number;
  effectiveStatus: RentalStatus;
  /** Кол-во продлений по аренде (chain отменены, считается по note='Продление…') */
  extensionsCount: number;
  canAcceptPayment: boolean;
  canComplete: boolean;
  onAcceptPayment: () => void;
  onComplete: () => void;
  onOpenDebts: () => void;
  /**
   * v0.6.1: вызывается при клике на ячейку «Долг»/«Просрочка». Получает
   * DOMRect самого элемента — родитель использует его для позиционирования
   * OverdueActionsPopover.
   */
  onOverdueClick?: (rect: DOMRect) => void;
}) {
  const isOverdue = effectiveStatus === "overdue";

  const endDate = parseDate(rental.endPlanned);
  const startDate = parseDate(rental.start);
  const today = new Date();
  const remaining = endDate ? daysBetween(today, endDate) : null;
  const overdueDays =
    isOverdue && endDate ? Math.abs(daysBetween(today, endDate)) : 0;

  const overdueBalance = debtSummary?.overdueBalance ?? 0;
  const manualBalance = debtSummary?.manualBalance ?? 0;
  const damageBalance = debtSummary?.damageBalance ?? totalDamageDebt;
  const totalDebt = pending + overdueBalance + damageBalance + manualBalance;

  const cells: Array<{
    key: string;
    label: string;
    value: string;
    sub?: string;
    tone: Tone;
    /**
     * v0.6.1: получает DOMRect нажатой ячейки — для popover-якоря. Если
     * обработчику rect не нужен, можно его проигнорировать.
     */
    onClick?: (rect: DOMRect) => void;
    action?: { icon: typeof AlertTriangle; onClick: () => void; title: string };
  }> = [];

  if (isOverdue) {
    cells.push({
      key: "overdue",
      label: "Просрочка",
      value: `${overdueDays} дн`,
      sub: endDate ? `с ${rental.endPlanned.slice(0, 5)}` : undefined,
      tone: "red",
      onClick: onOverdueClick
        ? (rect) => onOverdueClick(rect)
        : undefined,
    });
  } else if (startDate && daysBetween(today, startDate) > 0) {
    cells.push({
      key: "term",
      label: "До выдачи",
      value: `${daysBetween(today, startDate)} дн`,
      sub: `${rental.start.slice(0, 5)}`,
      tone: "blue",
    });
  } else if (remaining != null) {
    cells.push({
      key: "term",
      label: "Срок",
      value: remaining > 0 ? `осталось ${remaining} дн` : remaining === 0 ? "сегодня" : `${Math.abs(remaining)} дн`,
      sub: `${rental.start.slice(0, 5)} — ${rental.endPlanned.slice(0, 5)}`,
      tone: remaining < 0 ? "red" : "blue",
    });
  }

  cells.push({
    key: "this",
    label: "Эта аренда",
    value: `${fmt(rental.sum)} ₽`,
    sub: extensionsCount > 0 ? `продлений · ${extensionsCount}` : "сумма этой аренды",
    tone: "ink",
  });

  cells.push({
    key: "lifetime",
    label: "За всё время",
    value: `${fmt(paidIn)} ₽`,
    sub: "всех аренд клиента",
    tone: "blue",
  });

  if (totalDebt > 0) {
    const parts: string[] = [];
    if (pending > 0) parts.push(`не опл ${fmt(pending)}`);
    if (overdueBalance > 0) parts.push(`просрочка ${fmt(overdueBalance)}`);
    if (damageBalance > 0) parts.push(`ущерб ${fmt(damageBalance)}`);
    if (manualBalance > 0) parts.push(`ручной ${fmt(manualBalance)}`);
    cells.push({
      key: "debt",
      label: "Долг",
      value: `${fmt(totalDebt)} ₽`,
      sub: parts.join(" + "),
      tone: "red",
      // v0.6.1: клик по «Долг» открывает popover с быстрыми действиями
      // через onOverdueClick (рядом с просрочкой). Иконка-action остаётся
      // для перехода в полный drawer «История долгов».
      onClick: onOverdueClick ? (rect) => onOverdueClick(rect) : onOpenDebts,
      action: {
        icon: AlertTriangle,
        onClick: onOpenDebts,
        title: "История долгов",
      },
    });
  }

  return (
    <div className="rounded-2xl bg-surface border border-border shadow-card-sm overflow-hidden">
      <div className="flex flex-wrap divide-x divide-border">
        <div className="flex flex-1 divide-x divide-border min-w-0">
          {cells.map((c) => (
            <div key={c.key} className="flex-1 min-w-0">
              <KpiCell {...c} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-surface-soft/40 w-full sm:w-auto">
          {canAcceptPayment && (
            <button
              type="button"
              onClick={onAcceptPayment}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-green text-white px-3.5 py-2 text-[12.5px] font-bold hover:brightness-110 shadow-card-sm whitespace-nowrap"
            >
              <Wallet size={13} /> Принять оплату
            </button>
          )}
          {canComplete && (
            <button
              type="button"
              onClick={onComplete}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-surface border border-border text-ink-2 px-3 py-2 text-[12.5px] font-bold hover:bg-surface-soft whitespace-nowrap"
            >
              <Check size={13} /> Завершить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCell({
  label,
  value,
  sub,
  tone,
  onClick,
  action,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: Tone;
  onClick?: (rect: DOMRect) => void;
  action?: { icon: typeof AlertTriangle; onClick: () => void; title: string };
}) {
  const toneStyles: Record<Tone, { bg: string; text: string; sub: string }> = {
    ink: { bg: "bg-transparent", text: "text-ink", sub: "text-muted" },
    blue: { bg: "bg-transparent", text: "text-blue-700", sub: "text-muted" },
    red: { bg: "bg-red-soft", text: "text-red-ink", sub: "text-red-ink/80" },
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
      className={`relative px-3.5 py-3 text-left min-w-0 w-full ${t.bg} ${onClick ? "hover:brightness-95 cursor-pointer" : ""}`}
    >
      <div className="text-[9.5px] uppercase tracking-wider font-bold text-muted-2 truncate">
        {label}
      </div>
      <div
        className={`mt-1 font-display text-[15px] font-extrabold tabular-nums leading-tight truncate ${t.text}`}
      >
        {value}
      </div>
      {sub && (
        <div className={`mt-0.5 text-[10px] truncate ${t.sub}`}>{sub}</div>
      )}
      {action && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            action.onClick();
          }}
          title={action.title}
          className="absolute top-2 right-2 h-5 w-5 rounded-full flex items-center justify-center bg-white text-red-ink border border-red-200 hover:brightness-110 cursor-pointer"
        >
          <action.icon size={11} />
        </span>
      )}
    </Component>
  );
}
