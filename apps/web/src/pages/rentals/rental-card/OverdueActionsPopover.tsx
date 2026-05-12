/**
 * OverdueActionsPopover — popover с быстрыми действиями по просрочке.
 *
 * Открывается над/под якорем (anchorRect передаётся снаружи), оверлей под
 * popover'ом — для перехвата клика мимо и закрытия. Действия:
 *   • Принять оплату (закрывает popover + открывает PaymentAcceptDialog)
 *   • Простить 1 день (forgive-overdue target=days, daysCount=1)
 *   • Простить весь штраф (target=fine)
 *   • Простить всю просрочку (target=all)
 *
 * Дизайн по design/claude-design/Hulk Bike CRM/overdue-actions.jsx.
 */
import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Gift,
  Wallet,
  Waves,
} from "lucide-react";
import { useForgiveOverdue } from "@/lib/api/debt";
import { toast } from "@/lib/toast";
import type { DebtSummary } from "@/lib/api/debt";

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

export function OverdueActionsPopover({
  rentalId,
  anchorRect,
  debtSummary,
  dailyRate,
  onClose,
  onAcceptPayment,
}: {
  rentalId: number;
  /** Прямоугольник якорной кнопки (KPI-ячейки) — для позиционирования. */
  anchorRect: DOMRect | null;
  debtSummary: DebtSummary | undefined;
  /** Тариф/сутки — для подсказки «простить 1 день = X ₽». */
  dailyRate: number;
  onClose: () => void;
  onAcceptPayment: () => void;
}) {
  const forgiveMut = useForgiveOverdue();
  const popRef = useRef<HTMLDivElement | null>(null);

  // ESC + клик вне popover закрывают
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!anchorRect) return null;

  const overdueDays = debtSummary?.overdueDays ?? 0;
  const daysBalance = debtSummary?.overdueDaysBalance ?? 0;
  const fineBalance = debtSummary?.overdueFineBalance ?? 0;
  const totalOverdue = daysBalance + fineBalance;

  // Позиционирование: выровнять верхний-левый угол popover'а под нижним-левым
  // углом якоря. Если popover выйдет за низ viewport — поднять над якорем.
  const POP_WIDTH = 340;
  const POP_HEIGHT_EST = 280;
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  let left = anchorRect.left;
  let top = anchorRect.bottom + 6;
  if (left + POP_WIDTH + 8 > vw) left = Math.max(8, vw - POP_WIDTH - 8);
  if (top + POP_HEIGHT_EST + 8 > vh) {
    top = Math.max(8, anchorRect.top - POP_HEIGHT_EST - 6);
  }

  const handleForgive = async (
    target: "all" | "fine" | "days",
    daysCount?: number,
  ) => {
    try {
      const r = await forgiveMut.mutateAsync({
        rentalId,
        target,
        daysCount,
      });
      toast.success("Списано", `${(r.amount ?? 0).toLocaleString("ru-RU")} ₽`);
      onClose();
    } catch (e) {
      toast.error("Не удалось", (e as Error).message ?? "");
    }
  };

  return (
    <div className="fixed inset-0 z-[85]">
      {/* clickaway overlay */}
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0"
      />
      <div
        ref={popRef}
        role="dialog"
        aria-label="Действия по просрочке"
        style={{ left, top, width: POP_WIDTH }}
        className="absolute rounded-2xl bg-surface border border-border shadow-card-lg overflow-hidden animate-fade-in"
      >
        <div className="px-3 pt-3 pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-red-soft text-red-ink flex items-center justify-center shrink-0">
              <AlertTriangle size={13} />
            </div>
            <div className="min-w-0">
              <div className="text-[12.5px] font-bold text-ink">
                Просрочка {overdueDays} дн
              </div>
              <div className="text-[10.5px] text-muted truncate">
                {fmt(totalOverdue)} ₽ долга по {fmt(dailyRate)} ₽/сут
              </div>
            </div>
          </div>
        </div>
        <div className="py-1.5">
          <ActionRow
            icon={Wallet}
            title="Принять оплату"
            subtitle={`${fmt(totalOverdue)} ₽ — погасить просрочку`}
            tone="primary"
            onClick={() => {
              onClose();
              onAcceptPayment();
            }}
          />
          <ActionRow
            icon={Waves}
            title="Простить 1 день"
            subtitle={`−${fmt(dailyRate)} ₽ из долга`}
            disabled={daysBalance <= 0 || overdueDays < 1}
            onClick={() => handleForgive("days", 1)}
          />
          <ActionRow
            icon={Gift}
            title="Простить весь штраф"
            subtitle={`−${fmt(fineBalance)} ₽`}
            disabled={fineBalance <= 0}
            onClick={() => handleForgive("fine")}
          />
          <ActionRow
            icon={Gift}
            title="Простить всю просрочку"
            subtitle={`−${fmt(totalOverdue)} ₽ — обнулить долг`}
            tone="warn"
            disabled={totalOverdue <= 0}
            onClick={() => handleForgive("all")}
          />
        </div>
      </div>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  title,
  subtitle,
  tone,
  disabled,
  onClick,
}: {
  icon: typeof Wallet;
  title: string;
  subtitle: string;
  tone?: "primary" | "warn";
  disabled?: boolean;
  onClick: () => void;
}) {
  const toneCls =
    tone === "primary"
      ? "text-blue-700 hover:bg-blue-50"
      : tone === "warn"
        ? "text-orange-ink hover:bg-orange-soft/40"
        : "text-ink-2 hover:bg-surface-soft";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-start gap-2.5 px-3 py-2 text-left ${toneCls} disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
    >
      <Icon size={14} className="mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold">{title}</div>
        <div className="text-[10.5px] text-muted mt-0.5">{subtitle}</div>
      </div>
      <ChevronRight size={12} className="mt-1 text-muted-2 shrink-0" />
    </button>
  );
}
