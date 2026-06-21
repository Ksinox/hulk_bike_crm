import { useEffect, useMemo, useState } from "react";
import { SquareParking, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { Rental } from "@/lib/mock/rentals";
import {
  useCreateParking,
  usePayParking,
  parkingAmount,
  PARKING_RATE_PER_DAY,
} from "@/lib/api/parking";
import { useApiClient } from "@/lib/api/clients";
import { toastRentalDone } from "../rentalUndo";

/**
 * Паркинг в БОКОВОМ дровере приёмки оплаты (заказчик: все приёмки через один
 * боковой дровер с подменой контента). Два режима:
 *   • «период» (по умолчанию) — создаёт предоплаченную сессию [startIso..+days]
 *     и сразу принимает оплату (или «в долг»). Период выбран на календаре —
 *     здесь read-only.
 *   • «расчёт» (settle) — открытый паркинг УЖЕ снят (сессия закрыта); здесь
 *     только принимаем оплату накопленной суммы (нал/перевод/депозит) или
 *     закрываем → счёт падает в долг.
 *
 * Рендерится в том же слоте, что и PaymentAcceptDialog: inline — push-колонка
 * на странице Аренд (сдвигает карточку); иначе — slide-in справа (fallback
 * для дашборда/мобилы).
 */

const plusDaysIso = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
const fmtRu = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1].slice(2)}` : iso;
};

export function ParkingDrawer({
  rental,
  startIso,
  days,
  inline = false,
  onClose,
  settle,
}: {
  rental: Rental;
  startIso: string;
  days: number;
  inline?: boolean;
  onClose: () => void;
  /** Режим РАСЧЁТА снятого открытого паркинга: сессия уже закрыта, здесь
   *  только принимаем оплату накопленной суммы (или закрываем → долг). */
  settle?: { sessionId: number; amount: number };
}) {
  const create = useCreateParking();
  const pay = usePayParking();
  const [freeFirstDay, setFreeFirstDay] = useState(true);
  const [method, setMethod] = useState<"cash" | "transfer" | "deposit">("cash");
  const busy = create.isPending || pay.isPending;
  // Депозит клиента (кошелёк) — можно оплатить паркинг с него, если хватает.
  const { data: client } = useApiClient(rental.clientId ?? null);
  const depositBalance = client?.depositBalance ?? 0;

  const isSettle = !!settle;
  const safeDays = Math.max(1, days);
  const endIso = useMemo(
    () => plusDaysIso(startIso, safeDays - 1),
    [startIso, safeDays],
  );
  const periodAmount = useMemo(
    () => parkingAmount(safeDays, freeFirstDay),
    [safeDays, freeFirstDay],
  );
  // Сумма к оплате: в режиме расчёта — накопленное по сессии; иначе — по периоду.
  const amount = settle ? settle.amount : periodAmount;

  // Если выбран депозит, но на полную оплату не хватает (период вырос) —
  // откатываемся на наличные, чтобы не слать заведомо отклоняемую оплату.
  useEffect(() => {
    if (method === "deposit" && depositBalance < amount) setMethod("cash");
  }, [method, depositBalance, amount]);

  const errToast = (e: unknown) => {
    const msg =
      e instanceof ApiError
        ? (e.body as { message?: string } | null)?.message
        : null;
    toast.error(msg || "Не удалось");
  };

  const submit = async (collect: boolean) => {
    try {
      if (isSettle) {
        // Сессия уже закрыта снятием — только принимаем оплату накопленного.
        if (collect && amount > 0) {
          await pay.mutateAsync({ rentalId: rental.id, amount, method });
          toastRentalDone(
            rental,
            "Паркинг оплачен",
            `${amount.toLocaleString("ru-RU")} ₽`,
          );
        } else {
          toastRentalDone(
            rental,
            "Снят с паркинга",
            amount > 0 ? `${amount.toLocaleString("ru-RU")} ₽ — в долг` : "",
          );
        }
        onClose();
        return;
      }
      await create.mutateAsync({
        rentalId: rental.id,
        startDate: startIso,
        endDate: endIso,
        freeFirstDay,
      });
      if (collect && amount > 0) {
        await pay.mutateAsync({ rentalId: rental.id, amount, method });
        toastRentalDone(rental, "Паркинг оплачен", `${safeDays} дн · ${amount} ₽`);
      } else {
        toastRentalDone(
          rental,
          "Паркинг поставлен",
          amount > 0 ? `${amount} ₽ — в долг` : `${safeDays} дн`,
        );
      }
      onClose();
    } catch (e) {
      errToast(e);
    }
  };

  const body = (
    <>
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="inline-flex items-center gap-2 text-[15px] font-bold text-ink">
          <SquareParking size={17} className="text-yellow-600" /> Паркинг ·{" "}
          {isSettle ? "оплата" : "период"}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-surface-soft hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4">
        {/* Период (выбран на календаре / накоплен открытым паркингом) */}
        <div className="rounded-[10px] border border-yellow-300 bg-yellow-50 px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-yellow-700">
            {isSettle ? "Паркинг снят · к оплате" : "Период паркинга"}
          </div>
          <div className="mt-0.5 text-[14px] font-bold text-ink">
            {fmtRu(startIso)} – {fmtRu(endIso)} · {safeDays} дн
          </div>
          <div className="text-[11px] text-muted-2">
            {isSettle
              ? "оплата по факту или закрыть в долг"
              : "изменить — на календаре карточки"}
          </div>
        </div>

        {/* Тумблер «1-й день бесплатно» — только при создании периода; при
            расчёте снятого паркинга сумма уже зафиксирована сессией. */}
        {!isSettle && (
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
        )}

        <div className="flex items-center justify-between rounded-[10px] bg-surface-soft px-3 py-2.5">
          <span className="text-[12px] text-muted-2">
            {isSettle
              ? `Накоплено за ${safeDays} дн`
              : `${safeDays} дн × ${PARKING_RATE_PER_DAY} ₽${freeFirstDay ? " · 1-й бесплатно" : ""}`}
          </span>
          <b className="text-[17px] font-extrabold tabular-nums text-ink">
            {amount.toLocaleString("ru-RU")} ₽
          </b>
        </div>

        {amount > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-muted-2">
              Способ оплаты
            </span>
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
              {depositBalance > 0 && (
                <button
                  type="button"
                  disabled={depositBalance < amount}
                  onClick={() => setMethod("deposit")}
                  title={
                    depositBalance < amount
                      ? "Недостаточно средств на депозите клиента"
                      : undefined
                  }
                  className={cn(
                    "flex-1 rounded-lg border py-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    method === "deposit"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-border text-ink-2 hover:bg-surface-soft",
                  )}
                >
                  Депозит
                </button>
              )}
            </div>
            {depositBalance > 0 && (
              <span className="text-[11px] text-muted-2">
                На депозите клиента: {depositBalance.toLocaleString("ru-RU")} ₽
                {depositBalance < amount ? " — на полную оплату не хватит" : ""}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border bg-surface-soft px-5 py-4">
        <button
          type="button"
          onClick={() => submit(true)}
          disabled={busy}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-[14px] font-bold text-white transition-colors hover:bg-blue-600 disabled:opacity-60"
        >
          {amount > 0
            ? `Оплатить ${amount.toLocaleString("ru-RU")} ₽`
            : isSettle
              ? "Готово"
              : "Поставить"}
        </button>
        {amount > 0 && (
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={busy}
            className="inline-flex h-9 items-center justify-center rounded-lg px-4 text-[13px] font-semibold text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-60"
          >
            В долг — оплатить позже
          </button>
        )}
      </div>
    </>
  );

  if (inline) {
    return (
      <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card-sm">
        {body}
      </aside>
    );
  }
  return (
    <aside className="fixed bottom-0 right-0 top-0 z-[90] flex w-[min(95vw,460px)] flex-col bg-surface shadow-card-lg ring-1 ring-border animate-slide-in-right">
      {body}
    </aside>
  );
}
