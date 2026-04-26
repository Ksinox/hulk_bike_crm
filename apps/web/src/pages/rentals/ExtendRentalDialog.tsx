import { useEffect, useMemo, useState } from "react";
import { Check, Repeat, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MIN_RENTAL_DAYS,
  MODEL_LABEL,
  periodForDays,
  TARIFF,
  TARIFF_PERIOD_LABEL,
  type Rental,
} from "@/lib/mock/rentals";
import { extendRentalAsync } from "./rentalsStore";
import { toast } from "@/lib/toast";

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

export function ExtendRentalDialog({
  rental,
  onClose,
  onExtended,
}: {
  rental: Rental;
  onClose: () => void;
  onExtended?: (newRental: Rental) => void;
}) {
  const [closing, setClosing] = useState(false);
  const [days, setDays] = useState(7);

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

  const period = periodForDays(days);
  const rate = TARIFF[rental.model][period];
  const sum = rate * days;

  const newEndPlanned = useMemo(() => {
    const [d, m, y] = rental.endPlanned.split(".").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}.${dt.getFullYear()}`;
  }, [rental.endPlanned, days]);

  const [saving, setSaving] = useState(false);
  const handleExtend = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Ждём реальный id новой аренды-продления — нужен сразу для
      // navigate на новую карточку и для авто-открытия документа.
      const created = await extendRentalAsync(rental.id, days, rate, period);
      onExtended?.({
        ...rental,
        id: created.id,
        days,
        rate,
        sum: rate * days,
        endPlanned: newEndPlanned,
        parentRentalId: rental.id,
      } as Rental);
      requestClose();
    } catch (e) {
      toast.error(
        "Не удалось продлить",
        (e as Error).message ?? "Попробуйте ещё раз",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[120] flex items-center justify-center bg-ink/55 p-6 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
      onClick={requestClose}
    >
      <div
        className={cn(
          "w-full max-w-[480px] overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <Repeat size={16} className="text-blue-600" />
          <div className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
            Продлить аренду
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 text-[13px] text-ink-2">
          <div className="flex items-center justify-between rounded-[10px] bg-surface-soft px-3 py-2 text-[12px]">
            <span>
              {rental.scooter} · {MODEL_LABEL[rental.model]}
            </span>
            <span className="text-muted-2">
              до {rental.endPlanned} {rental.startTime || "12:00"}
            </span>
          </div>

          <label className="text-[12px] font-semibold text-ink">
            На сколько дней продлить
            <input
              type="number"
              min={MIN_RENTAL_DAYS}
              max={90}
              value={days}
              onChange={(e) =>
                setDays(
                  Math.max(MIN_RENTAL_DAYS, Number(e.target.value) || MIN_RENTAL_DAYS),
                )
              }
              className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-600"
            />
            <div className="mt-1 text-[10px] text-muted-2">
              минимум {MIN_RENTAL_DAYS} {MIN_RENTAL_DAYS === 1 ? "сутки" : "суток"} — тариф пересчитается автоматически
            </div>
          </label>

          <div className="grid grid-cols-3 gap-2">
            {(["short", "week", "month"] as const).map((p) => (
              <div
                key={p}
                className={cn(
                  "rounded-[10px] px-3 py-2 text-[11px]",
                  p === period
                    ? "bg-blue-50 text-blue-700"
                    : "bg-surface-soft text-muted",
                )}
              >
                <div className="font-semibold uppercase tracking-wider">
                  {TARIFF_PERIOD_LABEL[p]}
                </div>
                <div className="mt-0.5 tabular-nums">
                  {TARIFF[rental.model][p]} ₽/сут
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Calc label="Новый возврат" value={newEndPlanned} />
            <Calc label="Ставка" value={`${rate} ₽/сут`} />
            <Calc
              label="К оплате"
              value={`${fmt(sum)} ₽`}
              hint={`${rate} × ${days}`}
              emphasize
            />
          </div>

          <div className="rounded-[10px] bg-blue-50 px-3 py-2 text-[11px] text-blue-700">
            По бизнес-логике при продлении подписывается{" "}
            <b>новый договор</b>: старая аренда закроется как «Завершена», будет
            создана новая активная с тем же скутером. Залог переходит без
            повторной оплаты.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-soft px-5 py-3">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-full border border-border bg-surface px-4 py-1.5 text-[12px] font-semibold text-muted hover:bg-border"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleExtend}
            className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-700"
          >
            <Check size={13} /> Продлить и перейти к оплате
          </button>
        </div>
      </div>
    </div>
  );
}

function Calc({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] px-3 py-2",
        emphasize ? "bg-blue-50 text-blue-700" : "bg-surface-soft text-ink",
      )}
    >
      <div className="text-[11px] text-muted-2">{label}</div>
      <div
        className={cn(
          "font-semibold tabular-nums",
          emphasize ? "text-[16px]" : "text-[13px]",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-[10px] text-muted-2">{hint}</div>}
    </div>
  );
}
