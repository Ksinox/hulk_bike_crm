import { useMemo, useState } from "react";
import { SquareParking, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { DatePicker } from "@/components/ui/date-picker";
import {
  useCreateParking,
  usePayParking,
  parkingAmount,
  PARKING_RATE_PER_DAY,
  PARKING_MAX_DAYS,
} from "@/lib/api/parking";

/**
 * Окно постановки на паркинг + оплаты (заказчик 2026-06-19).
 *
 * Два режима:
 *  • «Открытый» (постоплата) — дата начала; паркинг растёт по дню, оплата при
 *    снятии. Кнопка «Поставить · оплата по факту».
 *  • «Период» (предоплата) — дата начала + число дней (степпер 1–7) → сумма
 *    известна сразу → «Оплатить N ₽» (поставить + принять оплату) либо «В долг»
 *    (поставить без оплаты — сумма повиснет долгом по паркингу).
 *
 * Тумблер «1-й день бесплатно» — по умолчанию ВКЛ (оператор может выключить
 * для повторных клиентов). Способ оплаты: Наличные / Перевод (депозит и
 * пересчёт-на-депозит при раннем возврате — следующий этап).
 */

const todayMskIso = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(
    new Date(),
  );
const plusDaysIso = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
const fmtRu = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}` : iso;
};

export function ParkingDialog({
  rentalId,
  minStartIso,
  onClose,
}: {
  rentalId: number;
  minStartIso: string | null;
  onClose: () => void;
}) {
  const create = useCreateParking();
  const pay = usePayParking();
  const [mode, setMode] = useState<"open" | "period">("period");
  const [freeFirstDay, setFreeFirstDay] = useState(true);
  const [startIso, setStartIso] = useState<string>(todayMskIso());
  const [days, setDays] = useState(3);
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const busy = create.isPending || pay.isPending;

  const endIso = useMemo(
    () => plusDaysIso(startIso, Math.max(1, days) - 1),
    [startIso, days],
  );
  const amount = useMemo(
    () => parkingAmount(days, freeFirstDay),
    [days, freeFirstDay],
  );

  const errToast = (e: unknown) => {
    const msg =
      e instanceof ApiError
        ? (e.body as { message?: string } | null)?.message
        : null;
    toast.error(msg || "Не удалось");
  };

  const submitOpen = async () => {
    try {
      await create.mutateAsync({ rentalId, startDate: startIso, freeFirstDay });
      toast.success("Поставлен на паркинг", "Открытый · оплата по факту");
      onClose();
    } catch (e) {
      errToast(e);
    }
  };

  const submitPeriod = async (collect: boolean) => {
    try {
      await create.mutateAsync({
        rentalId,
        startDate: startIso,
        endDate: endIso,
        freeFirstDay,
      });
      if (collect && amount > 0) {
        await pay.mutateAsync({ rentalId, amount, method });
        toast.success("Паркинг оплачен", `${days} дн · ${amount} ₽`);
      } else {
        toast.success(
          "Паркинг поставлен",
          amount > 0 ? `${amount} ₽ — в долг` : `${days} дн`,
        );
      }
      onClose();
    } catch (e) {
      errToast(e);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-ink/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] overflow-hidden rounded-2xl bg-surface shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="inline-flex items-center gap-2 text-[15px] font-bold text-ink">
            <SquareParking size={17} className="text-yellow-600" /> Паркинг
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-surface-soft hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {/* Режим */}
        <div className="px-5 pt-4">
          <div className="flex rounded-[10px] bg-surface-soft p-1 text-[13px] font-semibold">
            <button
              type="button"
              onClick={() => setMode("open")}
              className={cn(
                "flex-1 rounded-lg py-1.5 transition-colors",
                mode === "open"
                  ? "bg-surface text-ink shadow-sm"
                  : "text-muted-2 hover:text-ink",
              )}
            >
              Открытый
            </button>
            <button
              type="button"
              onClick={() => setMode("period")}
              className={cn(
                "flex-1 rounded-lg py-1.5 transition-colors",
                mode === "period"
                  ? "bg-surface text-ink shadow-sm"
                  : "text-muted-2 hover:text-ink",
              )}
            >
              Период · предоплата
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3.5 px-5 py-4">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-muted-2">
              Дата начала
            </span>
            <DatePicker
              value={startIso}
              onChange={(v) => v && setStartIso(v)}
              minDate={minStartIso ?? undefined}
              clearable={false}
            />
          </label>

          {mode === "period" && (
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink-2">
                Сколько дней
              </span>
              <div className="inline-flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setDays((d) => Math.max(1, d - 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-[16px] font-bold text-ink-2 hover:bg-surface-soft"
                >
                  −
                </button>
                <span className="w-6 text-center text-[16px] font-bold tabular-nums text-ink">
                  {days}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setDays((d) => Math.min(PARKING_MAX_DAYS, d + 1))
                  }
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-[16px] font-bold text-ink-2 hover:bg-surface-soft"
                >
                  +
                </button>
                <span className="ml-1 text-[12px] text-muted-2">
                  до {fmtRu(endIso)}
                </span>
              </div>
            </div>
          )}

          <label className="flex items-center justify-between">
            <span className="text-[13px] text-ink-2">1-й день бесплатно</span>
            <button
              type="button"
              role="switch"
              aria-checked={freeFirstDay}
              onClick={() => setFreeFirstDay((v) => !v)}
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                freeFirstDay ? "bg-blue-600" : "bg-border",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                  freeFirstDay ? "left-[18px]" : "left-0.5",
                )}
              />
            </button>
          </label>

          {mode === "period" && (
            <div className="flex items-center justify-between rounded-[10px] bg-surface-soft px-3 py-2.5">
              <span className="text-[12px] text-muted-2">
                {days} дн × {PARKING_RATE_PER_DAY} ₽
                {freeFirstDay ? " · 1-й бесплатно" : ""}
              </span>
              <b className="text-[17px] font-extrabold tabular-nums text-ink">
                {amount.toLocaleString("ru-RU")} ₽
              </b>
            </div>
          )}

          {mode === "period" && amount > 0 && (
            <div className="flex gap-2">
              {(["cash", "transfer"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn(
                    "flex-1 rounded-lg border py-2 text-[13px] font-semibold transition-colors",
                    method === m
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-border text-ink-2 hover:bg-surface-soft",
                  )}
                >
                  {m === "cash" ? "Наличные" : "Перевод"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border bg-surface-soft px-5 py-4">
          {mode === "open" ? (
            <button
              type="button"
              onClick={submitOpen}
              disabled={busy}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-[14px] font-bold text-white transition-colors hover:bg-blue-600 disabled:opacity-60"
            >
              Поставить · оплата по факту
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => submitPeriod(true)}
                disabled={busy}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-[14px] font-bold text-white transition-colors hover:bg-blue-600 disabled:opacity-60"
              >
                {amount > 0
                  ? `Оплатить ${amount.toLocaleString("ru-RU")} ₽`
                  : "Поставить"}
              </button>
              {amount > 0 && (
                <button
                  type="button"
                  onClick={() => submitPeriod(false)}
                  disabled={busy}
                  className="inline-flex h-9 items-center justify-center rounded-lg px-4 text-[13px] font-semibold text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-60"
                >
                  В долг — оплатить позже
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
