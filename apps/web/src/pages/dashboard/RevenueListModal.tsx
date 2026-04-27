import { useEffect, useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RevenueRentalsList, type RevenuePeriod } from "./RevenueRentalsList";

const TABS: { id: RevenuePeriod; label: string }[] = [
  { id: "day", label: "День" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
];

/** Полноэкранный список аренд за выбранный период (тумблер день/неделя/месяц). */
export function RevenueListModal({
  initialPeriod,
  onClose,
}: {
  initialPeriod: RevenuePeriod;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [period, setPeriod] = useState<RevenuePeriod>(initialPeriod);

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
        "fixed inset-0 z-[120] flex items-center justify-center bg-ink/55 p-4 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
      onClick={requestClose}
    >
      <div
        className={cn(
          "flex w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          "max-h-[90vh]",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <Minimize2 size={18} className="text-blue-600" />
          <div className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
            Аренды за выбранный период
          </div>
          <div className="inline-flex rounded-full bg-surface p-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPeriod(t.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
                  period === t.id
                    ? "bg-ink text-white"
                    : "bg-transparent text-muted-2 hover:text-ink",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <RevenueRentalsList
            period={period}
            onRowClick={() => requestClose()}
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
