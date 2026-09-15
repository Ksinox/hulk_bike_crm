import { useMemo } from "react";
import {
  Banknote,
  Bike,
  CreditCard,
  Flag,
  ReceiptText,
  ShoppingBag,
  X,
} from "lucide-react";
import { useApiPayments } from "@/lib/api/payments";
import {
  useRentals,
  useArchivedRentals,
} from "@/pages/rentals/rentalsStore";
import { formatRub } from "@/pages/dashboard/useDashboardMetrics";
import { cn } from "@/lib/utils";

/**
 * Пункт 7 — «Сводка дня» (Z-отчёт).
 *
 * НЕ кассовый отчёт с закрытием смены: это оперативная сводка за ТЕКУЩИЕ
 * СУТКИ (с 00:00 до 00:00), доступная в любой момент дня. Открыл в середине
 * дня — видишь показатели на текущий момент:
 *   • касса: наличные / безнал (суммы и количество платежей);
 *   • аренды: активных сейчас, выдано сегодня, завершено сегодня;
 *   • продажи — появятся вместе с разделом продаж.
 *
 * Критерии «что считается выручкой» — те же, что в плашке «Выручка»
 * (см. useRevenue.ts / RevenueCard): paid + не залог/возврат + не оплата
 * из депозита (кроме удержания) + не исключённые (пункт 2).
 */

type DayReportData = {
  cash: number;
  cashCount: number;
  cashless: number;
  cashlessCount: number;
  total: number;
  totalCount: number;
  activeNow: number;
  issuedToday: number;
  completedToday: number;
};

export function useDayReport(): DayReportData {
  const { data: payments } = useApiPayments();
  const active = useRentals();
  const archived = useArchivedRentals();

  return useMemo(() => {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const todayRu = now.toLocaleDateString("ru-RU");

    let cash = 0;
    let cashCount = 0;
    let cashless = 0;
    let cashlessCount = 0;
    for (const p of payments ?? []) {
      if (!p.paid || !p.paidAt) continue;
      if (p.excludedFromRevenue) continue;
      if (p.type === "deposit" || p.type === "refund") continue;
      if (p.method === "deposit" && p.type !== "deposit_forfeit") continue;
      const t = new Date(p.paidAt).getTime();
      if (t < dayStart.getTime() || t > now.getTime()) continue;
      if (p.method === "cash") {
        cash += p.amount;
        cashCount += 1;
      } else {
        cashless += p.amount;
        cashlessCount += 1;
      }
    }

    // Один id может оказаться в обоих списках (rentals + архив) — дедуп.
    const seen = new Set<number>();
    const all = [...active, ...archived].filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    // Тот же критерий «активная», что и на дашборде (useDashboardMetrics).
    const activeNow = active.filter(
      (r) => r.status === "active" && r.scooterId != null,
    ).length;
    const issuedToday = all.filter((r) => r.start === todayRu).length;
    const completedToday = all.filter(
      (r) => r.status === "completed" && r.endActual === todayRu,
    ).length;

    return {
      cash,
      cashCount,
      cashless,
      cashlessCount,
      total: cash + cashless,
      totalCount: cashCount + cashlessCount,
      activeNow,
      issuedToday,
      completedToday,
    };
  }, [payments, active, archived]);
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

const pluralPayments = (n: number) =>
  `${n} ${plural(n, "платёж", "платежа", "платежей")}`;

/** Модальное окно сводки. Адаптивно: центр на десктопе, снизу на мобиле. */
export function DayReportDialog({ onClose }: { onClose: () => void }) {
  const d = useDayReport();
  const now = new Date();
  const dateLabel = now.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
  const timeLabel = now.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-ink/50 backdrop-blur-sm animate-fade-in sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] rounded-t-3xl bg-surface p-5 shadow-card-lg animate-modal-in sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка */}
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <ReceiptText size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-bold text-ink">Сводка дня</div>
            <div className="text-[12px] text-muted">
              {dateLabel} · с 00:00 по {timeLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-soft text-muted transition-colors hover:bg-red-soft hover:text-red-ink"
          >
            <X size={16} />
          </button>
        </div>

        {/* Касса за сутки */}
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
          Касса за сутки
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-green-soft p-3.5">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-green-ink">
              <Banknote size={14} /> Наличные
            </div>
            <div className="mt-1 text-[22px] font-bold tabular-nums text-ink">
              {formatRub(d.cash)} ₽
            </div>
            <div className="text-[11.5px] text-muted">
              {pluralPayments(d.cashCount)}
            </div>
          </div>
          <div className="rounded-2xl bg-blue-50 p-3.5">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-blue-700">
              <CreditCard size={14} /> Безнал
            </div>
            <div className="mt-1 text-[22px] font-bold tabular-nums text-ink">
              {formatRub(d.cashless)} ₽
            </div>
            <div className="text-[11.5px] text-muted">
              {pluralPayments(d.cashlessCount)}
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between rounded-2xl bg-ink px-4 py-3 text-white">
          <span className="text-[12.5px] font-semibold text-white/80">
            Итого за сутки
          </span>
          <span className="text-[17px] font-bold tabular-nums">
            {formatRub(d.total)} ₽
            <span className="ml-2 text-[11.5px] font-medium text-white/60">
              {pluralPayments(d.totalCount)}
            </span>
          </span>
        </div>

        {/* Аренды */}
        <div className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wider text-muted-2">
          Аренды
        </div>
        <div className="flex flex-col divide-y divide-border rounded-2xl border border-border">
          <ReportRow
            icon={<Bike size={15} />}
            tone="blue"
            label="Активных сейчас"
            value={d.activeNow}
          />
          <ReportRow
            icon={<Bike size={15} />}
            tone="green"
            label="Выдано сегодня"
            value={d.issuedToday}
          />
          <ReportRow
            icon={<Flag size={15} />}
            tone="neutral"
            label="Завершено сегодня"
            value={d.completedToday}
          />
        </div>

        {/* Продажи — раздел ещё готовится (пункты Б2-Б3) */}
        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-dashed border-border px-3.5 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-soft text-muted-2">
            <ShoppingBag size={15} />
          </div>
          <span className="flex-1 text-[13px] font-semibold text-muted">
            Продажи за сутки
          </span>
          <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-2">
            скоро
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-12 w-full rounded-2xl bg-blue-600 text-[14px] font-bold text-white transition-colors hover:bg-blue-700 active:scale-[0.99]"
        >
          Понятно
        </button>
      </div>
    </div>
  );
}

function ReportRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "blue" | "green" | "neutral";
}) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]",
          tone === "blue" && "bg-blue-50 text-blue-600",
          tone === "green" && "bg-green-soft text-green-ink",
          tone === "neutral" && "bg-surface-soft text-muted",
        )}
      >
        {icon}
      </div>
      <span className="flex-1 text-[13px] font-semibold text-ink-2">
        {label}
      </span>
      <span className="text-[17px] font-bold tabular-nums text-ink">
        {value}
      </span>
    </div>
  );
}
