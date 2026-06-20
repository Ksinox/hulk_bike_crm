/**
 * OverdueActionsPopover — popover с быстрыми действиями по просрочке.
 *
 * Открывается над/под якорем (anchorRect передаётся снаружи), оверлей под
 * popover'ом — для перехвата клика мимо и закрытия. v0.6.10: ровно 3 действия
 * (по дизайну overdue-actions.jsx, action 'pause' не реализуется):
 *   • Принять оплату — закрывает popover + открывает PaymentAcceptDialog
 *   • Простить 1 день — forgive-overdue target=days, daysCount=1
 *   • Простить всю просрочку — target=all
 *
 * v0.6.15 (B2): popover расширен — вверху показывается список ВСЕХ
 * долгов клиента (агрегат по всем арендам через useDebtAggregate +
 * фильтр по clientId). Группировка по аренде (rentalId), а внутри
 * аренды — типы долга (overdue, damage, manual, pending). Ширина
 * увеличена до 440px.
 *
 * Каждая строка действия: иконка слева + title жирным + subtitle серым + chevron.
 * Tones: primary (синий — Принять оплату), default (нейтр — 1 день), warn
 * (оранжевый — Всю просрочку, как destructive-подсветка).
 */
import { useEffect, useMemo, useRef } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Gift,
  Wallet,
  Waves,
} from "lucide-react";
import { useDebtAggregate, useForgiveOverdue } from "@/lib/api/debt";
import { toast } from "@/lib/toast";
import { toastRentalDone } from "../rentalUndo";
import type { DebtSummary } from "@/lib/api/debt";

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

export function OverdueActionsPopover({
  rentalId,
  clientId,
  anchorRect,
  debtSummary,
  dailyRate,
  onClose,
  onAcceptPayment,
}: {
  rentalId: number;
  /** v0.6.15: B2 — для агрегата всех долгов клиента по всем арендам. */
  clientId?: number | null;
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
  // v0.6.15: B2 — все долги клиента по всем арендам.
  const { data: aggregateAll = [] } = useDebtAggregate();
  const clientDebts = useMemo(() => {
    if (clientId == null) return [];
    return aggregateAll.filter(
      (d) => d.clientId === clientId && d.totalDebt > 0,
    );
  }, [aggregateAll, clientId]);
  const totalClientDebt = useMemo(
    () => clientDebts.reduce((s, d) => s + d.totalDebt, 0),
    [clientDebts],
  );

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
  // v0.6.15: ширина увеличена до 440 — теперь поверху есть список всех
  // долгов клиента, height-estimate тоже больше.
  const POP_WIDTH = 440;
  const POP_HEIGHT_EST = clientDebts.length > 0 ? 380 : 220;
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
      toastRentalDone(
        { id: rentalId, status: "active" },
        "Списано",
        `${(r.amount ?? 0).toLocaleString("ru-RU")} ₽`,
      );
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
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-bold text-ink">
                Просрочка {overdueDays} дн
              </div>
              <div className="text-[10.5px] text-muted truncate">
                {fmt(totalOverdue)} ₽ по этой аренде · {fmt(dailyRate)} ₽/сут
              </div>
            </div>
            {totalClientDebt > totalOverdue && (
              <div className="text-right shrink-0">
                <div className="text-[9.5px] uppercase tracking-wider font-bold text-muted-2">
                  Всего у клиента
                </div>
                <div className="text-[12px] font-extrabold tabular-nums text-red-ink">
                  {fmt(totalClientDebt)} ₽
                </div>
              </div>
            )}
          </div>
        </div>
        {/* v0.6.15: B2 — список всех долгов клиента по всем арендам. */}
        {clientDebts.length > 0 && (
          <div className="max-h-[200px] overflow-y-auto scrollbar-thin px-3 py-2 border-b border-border bg-surface-soft/50">
            <div className="text-[9.5px] uppercase tracking-wider font-bold text-muted-2 mb-1.5">
              Все долги клиента
            </div>
            <div className="flex flex-col gap-1.5">
              {clientDebts.map((d) => (
                <ClientDebtRow
                  key={d.rentalId}
                  rentalId={d.rentalId}
                  highlight={d.rentalId === rentalId}
                  overdueBalance={d.overdueBalance}
                  damageBalance={d.damageBalance}
                  manualBalance={d.manualBalance}
                  pendingRent={d.pendingRent}
                  overdueDays={d.overdueDays}
                  totalDebt={d.totalDebt}
                />
              ))}
            </div>
          </div>
        )}
        <div className="py-1.5">
          <ActionRow
            icon={Wallet}
            title="Принять оплату"
            subtitle={`${fmt(totalOverdue)} ₽ — погасить весь долг`}
            tone="primary"
            onClick={() => {
              onClose();
              onAcceptPayment();
            }}
          />
          <ActionRow
            icon={Waves}
            title="Простить 1 день"
            subtitle={`−${fmt(dailyRate)} ₽ из долга, без обоснования`}
            disabled={daysBalance <= 0 || overdueDays < 1}
            onClick={() => handleForgive("days", 1)}
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

/**
 * v0.6.15: B2 — строка долга по одной аренде клиента в popover'е «Долг».
 *
 * Группирует долг по типам: просрочка / ущерб / ручной / pending.
 * Highlight=true — для текущей аренды (с которой open'нули popover).
 */
function ClientDebtRow({
  rentalId,
  highlight,
  overdueBalance,
  damageBalance,
  manualBalance,
  pendingRent,
  overdueDays,
  totalDebt,
}: {
  rentalId: number;
  highlight: boolean;
  overdueBalance: number;
  damageBalance: number;
  manualBalance: number;
  pendingRent: number;
  overdueDays: number;
  totalDebt: number;
}) {
  const parts: Array<{ label: string; amount: number }> = [];
  if (overdueBalance > 0) {
    parts.push({
      label: overdueDays > 0 ? `Просрочка ${overdueDays} дн` : "Просрочка",
      amount: overdueBalance,
    });
  }
  if (damageBalance > 0) parts.push({ label: "Ущерб по акту", amount: damageBalance });
  if (manualBalance > 0) parts.push({ label: "Ручное начисление", amount: manualBalance });
  if (pendingRent > 0) parts.push({ label: "Неоплаченные платежи", amount: pendingRent });
  return (
    <div
      className={
        "rounded-[10px] border px-2.5 py-1.5 " +
        (highlight
          ? "border-red-300 bg-red-soft/30"
          : "border-border bg-surface")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold text-ink">
          Аренда #{String(rentalId).padStart(4, "0")}
          {highlight && (
            <span className="ml-1 text-[9.5px] font-bold text-red-ink uppercase tracking-wider">
              · текущая
            </span>
          )}
        </div>
        <div className="text-[12px] font-extrabold tabular-nums text-red-ink shrink-0">
          {fmt(totalDebt)} ₽
        </div>
      </div>
      {parts.length > 0 && (
        <div className="mt-1 flex flex-col gap-0.5">
          {parts.map((p, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-2 text-[10.5px]"
            >
              <span className="text-muted">{p.label}</span>
              <span className="tabular-nums font-semibold text-ink-2">
                {fmt(p.amount)} ₽
              </span>
            </div>
          ))}
        </div>
      )}
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
