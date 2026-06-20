import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import {
  RevenueRentalsList,
  resolveRevenueWindow,
  billingPeriodLabel,
  type RevenuePeriod,
  type MethodFilter,
  type RevenueScope,
} from "@/pages/dashboard/RevenueRentalsList";
import { RevenueDashboard } from "@/pages/dashboard/RevenueDashboard";
import { DateRangePicker } from "@/components/ui/date-picker";
import { useRevenueAnalytics } from "@/lib/useRevenueAnalytics";
import { useBillingPeriodAnchors } from "@/lib/api/billing-period";
import { useRentals, useArchivedRentals } from "@/pages/rentals/rentalsStore";
import { RentalCard } from "@/pages/rentals/RentalCard";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { MobileChips } from "../ui";

/**
 * Мобильная полноэкранная сводка выручки — мобильная версия RevenueListModal.
 * Тот же data-слой (useRevenueAnalytics) и тот же визуал-блок (RevenueDashboard,
 * он адаптивный и сам стопится в одну колонку на телефоне). Управление
 * периодом/способом — чипсами под телефон, тач-таргеты крупные. Тап по
 * платежу — «проваливаемся» в полноэкранную карточку аренды (как в Аренды).
 */
export function MobileRevenueScreen({
  scope,
  onClose,
}: {
  scope: RevenueScope;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState<RevenuePeriod>("month");
  const [method, setMethod] = useState<MethodFilter>("all");
  const [openId, setOpenId] = useState<number | null>(null);
  // #24: произвольный период (календарь) на мобиле — как на десктопе. Если
  // задан, перекрывает чипсы День/Неделя/Месяц (они подсвечиваются как
  // неактивные).
  const [customRange, setCustomRange] = useState<{
    from: string;
    to: string;
  } | null>(null);

  // Подписка на якоря: окно/подпись расчётного периода считаются через
  // глобал billingPeriod, который заполняется с сервера асинхронно.
  // Без подписки экран мог бы открыться со стале-периодом (день 15).
  const anchorsQ = useBillingPeriodAnchors();
  const { start, end } = useMemo(
    () => resolveRevenueWindow({ period, range: customRange }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period, customRange, anchorsQ.data],
  );
  const a = useRevenueAnalytics({ scope, start, end });

  const active = useRentals();
  const archived = useArchivedRentals();
  const openRental = useMemo(
    () => [...active, ...archived].find((r) => r.id === openId) ?? null,
    [active, archived, openId],
  );

  const periodLabel = customRange
    ? `${customRange.from.slice(8, 10)}.${customRange.from.slice(5, 7)} — ${customRange.to.slice(8, 10)}.${customRange.to.slice(5, 7)}`
    : period === "day"
      ? "Сегодня"
      : period === "week"
        ? "Эта неделя"
        : billingPeriodLabel();
  const scopeLabel = scope === "rentals" ? "аренды" : "все операции";
  const heading = scope === "rentals" ? "Выручка — аренды" : "Выручка";

  return (
    <div className="fixed inset-0 z-[60] flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-surface-soft animate-slide-in-right">
      {/* Шапка */}
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2.5">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-surface-soft"
          aria-label="Назад"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="min-w-0 flex-1 text-[16px] font-bold text-ink">
          {heading}
        </div>
      </div>

      {/* Контролы: период (чипсы + произвольный диапазон) + способ оплаты */}
      <div className="flex flex-col gap-2 border-b border-border bg-surface px-3 py-2">
        <MobileChips
          options={[
            { id: "day" as RevenuePeriod, label: "День" },
            { id: "week" as RevenuePeriod, label: "Неделя" },
            { id: "month" as RevenuePeriod, label: "Месяц" },
          ]}
          // #24: при выбранном произвольном диапазоне чипсы гасим (пустое
          // значение не совпадает ни с одним id).
          value={customRange ? ("" as RevenuePeriod) : period}
          onChange={(p) => {
            setPeriod(p);
            setCustomRange(null);
          }}
        />
        {/* #24: произвольный период — календарь на всю ширину под чипсами
            (как DateRangePicker на десктопе, но full-width под телефон). */}
        <DateRangePicker
          from={customRange?.from ?? null}
          to={customRange?.to ?? null}
          placeholder="Произвольный период"
          onChange={({ from, to }) =>
            setCustomRange(from && to ? { from, to } : null)
          }
        />
        <MobileChips
          options={[
            { id: "all" as MethodFilter, label: "Все" },
            { id: "cash" as MethodFilter, label: "Наличные" },
            { id: "cashless" as MethodFilter, label: "Безнал" },
          ]}
          value={method}
          onChange={setMethod}
        />
      </div>

      {/* Прокручиваемое тело: аналитика + детализация платежей */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 pb-20">
        <RevenueDashboard
          a={a}
          periodLabel={periodLabel}
          scopeLabel={scopeLabel}
          start={start}
          end={end}
        />
        <div className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-wider text-muted-2">
          Платежи за период · детализация
        </div>
        <RevenueRentalsList
          period={period}
          range={customRange}
          methodFilter={method}
          scope={scope}
          compact={false}
          onRowClick={(id) => setOpenId(id)}
        />
      </div>

      {/* Drill-in: полноэкранная карточка аренды поверх сводки. */}
      {openRental && (
        <div className="fixed inset-0 z-[70] flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-surface">
          <ErrorBoundary key={openRental.id}>
            <RentalCard
              rental={openRental}
              drawerChrome
              onClose={() => setOpenId(null)}
              onSwapped={(newId) => setOpenId(newId)}
            />
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}
