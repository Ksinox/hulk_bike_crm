import { useEffect, useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  RevenueRentalsList,
  type RevenuePeriod,
  type MethodFilter,
} from "./RevenueRentalsList";
import { useDashboardDrawer } from "./DashboardDrawer";
import { DateRangePicker } from "@/components/ui/date-picker";

const TABS: { id: RevenuePeriod; label: string }[] = [
  { id: "day", label: "День" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
];

const METHOD_TABS: { id: MethodFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "cash", label: "Наличные" },
  { id: "cashless", label: "Безнал" },
];

/**
 * Полноэкранный список ПЛАТЕЖЕЙ за период — для сверки бухгалтерии.
 * Период: день/неделя/месяц ИЛИ произвольный диапазон (фирменный календарь).
 * Фильтр способа: всё / наличные / безнал. Клик по платежу → карточка аренды.
 */
export function RevenueListModal({
  initialPeriod,
  initialRange = null,
  initialMethodFilter = "all",
  onClose,
}: {
  initialPeriod: RevenuePeriod;
  initialRange?: { from: string; to: string } | null;
  initialMethodFilter?: MethodFilter;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [period, setPeriod] = useState<RevenuePeriod>(initialPeriod);
  const [customRange, setCustomRange] = useState<{
    from: string;
    to: string;
  } | null>(initialRange);
  const [methodFilter, setMethodFilter] =
    useState<MethodFilter>(initialMethodFilter);
  const drawer = useDashboardDrawer();

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 160);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-0 z-[120] flex items-stretch justify-center overflow-y-auto bg-ink/55 p-0 backdrop-blur-sm sm:items-center sm:p-4",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
    >
      <div
        className={cn(
          "flex w-full max-w-[1200px] flex-col overflow-hidden rounded-none bg-surface shadow-card-lg sm:rounded-2xl",
          "h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[90vh]",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка: заголовок + закрыть */}
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <Minimize2 size={18} className="text-blue-600" />
          <div className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
            Платежи за период
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {/* Контролы: период (табы) + произвольный диапазон + фильтр способа */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-2.5">
          <div className="inline-flex rounded-full bg-surface-soft p-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setPeriod(t.id);
                  setCustomRange(null);
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
                  !customRange && period === t.id
                    ? "bg-ink text-white"
                    : "bg-transparent text-muted-2 hover:text-ink",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <DateRangePicker
            from={customRange?.from ?? null}
            to={customRange?.to ?? null}
            placeholder="Произвольный период"
            className="w-[220px]"
            onChange={({ from, to }) =>
              setCustomRange(from && to ? { from, to } : null)
            }
          />

          <div className="ml-auto inline-flex rounded-full border border-border bg-surface p-0.5">
            {METHOD_TABS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setMethodFilter(f.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
                  methodFilter === f.id
                    ? f.id === "cash"
                      ? "bg-green-ink text-white"
                      : f.id === "cashless"
                        ? "bg-blue-600 text-white"
                        : "bg-ink text-white"
                    : "text-muted-2 hover:text-ink",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
          <RevenueRentalsList
            period={period}
            range={customRange}
            methodFilter={methodFilter}
            onRowClick={(id) => {
              requestClose();
              drawer.openRental(id);
            }}
            compact={false}
          />
        </div>
      </div>
    </div>
  );
}

/** Иконка-кнопка для шапки RevenueCard, открывающая модалку. */
export function ExpandRevenueButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="На весь экран"
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white/80 transition-colors hover:bg-white/30 hover:text-white",
        className,
      )}
    >
      <Maximize2 size={14} />
    </button>
  );
}
