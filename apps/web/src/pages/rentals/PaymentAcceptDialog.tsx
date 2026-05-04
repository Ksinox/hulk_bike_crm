/**
 * v0.3.9 — диалог приёма оплаты по аренде.
 *
 * Сценарий: после продления аренды (или при оплате уже созданной аренды)
 * оператор открывает этот диалог, видит «К оплате», использует депозит
 * клиента (если есть), вводит сумму принятых от клиента наличных/карты,
 * и подтверждает. Авто-распределение:
 *
 *   1. Депозит клиента (если включена галка) — гасит часть от sum.
 *   2. Cash = сумма наличными от клиента (вводит оператор).
 *   3. Если cash + используемый депозит >= sum → аренда оплачена,
 *      переплата уходит обратно в депозит.
 *   4. Если cash + депозит < sum → платёж создаётся как paid=false
 *      (плановая часть оплачена, остаток ждёт следующего платежа).
 *
 * §18 заказчика «переплата → просрочка»: пока в этом диалоге излишек
 * валится в депозит. На активной просрочке диалог не используется
 * (открывается из ExtendRentalDialog для свежей связки) — там просрочки
 * ещё нет. Если позже (ит.5) обнаружится переплата + старая просрочка
 * — диалог расширим.
 */
import { useEffect, useState } from "react";
import { Check, X, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { api } from "@/lib/api";
import { useApiClients } from "@/lib/api/clients";
import type { Rental } from "@/lib/mock/rentals";
import type { PaymentMethod } from "@/lib/mock/rentals";

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "cash", label: "Наличные" },
  { id: "card", label: "Карта" },
  { id: "transfer", label: "Перевод" },
];

export function PaymentAcceptDialog({
  rental,
  onClose,
  onPaid,
}: {
  rental: Rental;
  onClose: () => void;
  onPaid?: () => void;
}) {
  const [closing, setClosing] = useState(false);
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

  const { data: clients = [] } = useApiClients();
  const client = clients.find((c) => c.id === rental.clientId);
  const depositBalance = client?.depositBalance ?? 0;

  const sum = rental.sum;
  const [useDeposit, setUseDeposit] = useState<boolean>(depositBalance > 0);
  const depositToUse = useDeposit ? Math.min(depositBalance, sum) : 0;
  const remainingAfterDeposit = Math.max(0, sum - depositToUse);

  const [acceptedStr, setAcceptedStr] = useState<string>(
    String(remainingAfterDeposit),
  );
  // Если меняется состав депозита — переустановим «принято» = остаток
  useEffect(() => {
    setAcceptedStr(String(remainingAfterDeposit));
  }, [remainingAfterDeposit]);

  const accepted = Number(acceptedStr.replace(/\D/g, "")) || 0;
  const totalReceived = depositToUse + accepted;
  const overpay = Math.max(0, totalReceived - sum);
  const underpay = Math.max(0, sum - totalReceived);

  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [saving, setSaving] = useState(false);

  const fmt = (n: number) => n.toLocaleString("ru-RU");

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // 1. Списать депозит, если используется
      if (depositToUse > 0) {
        await api.post(
          `/api/clients/${rental.clientId}/deposit/spend`,
          {
            amount: depositToUse,
            comment: `В счёт аренды #${rental.id}`,
            rentalId: rental.id,
          },
        );
      }
      // 2. Создать rent-платёж на сумму депозит + принято (или paid=false если меньше)
      const rentAmount = Math.min(sum, totalReceived);
      if (rentAmount > 0) {
        await api.post("/api/payments", {
          rentalId: rental.id,
          type: "rent",
          amount: rentAmount,
          method,
          paid: rentAmount >= sum,
          paidAt: new Date().toISOString(),
        });
      } else if (sum > 0) {
        // Плательщик ничего не внёс и депозита нет — создаём плановый
        // (paid=false) платёж, чтобы он висел в долге.
        await api.post("/api/payments", {
          rentalId: rental.id,
          type: "rent",
          amount: sum,
          method,
          paid: false,
        });
      }
      // 3. Переплата → пополнение депозита
      if (overpay > 0) {
        await api.post(
          `/api/clients/${rental.clientId}/deposit/charge`,
          {
            amount: overpay,
            comment: `Переплата по аренде #${rental.id}`,
            rentalId: rental.id,
          },
        );
      }

      if (overpay > 0) {
        toast.success(
          "Оплата принята",
          `Аренда оплачена. Переплата ${fmt(overpay)} ₽ ушла в депозит.`,
        );
      } else if (underpay > 0) {
        toast.info(
          "Принят частичный платёж",
          `Остаток ${fmt(underpay)} ₽ висит за клиентом.`,
        );
      } else {
        toast.success("Оплата принята", `Аренда оплачена полностью.`);
      }

      onPaid?.();
      requestClose();
    } catch (e) {
      toast.error("Не удалось принять оплату", (e as Error).message ?? "");
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
    >
      <div
        className={cn(
          "w-full max-w-[480px] overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <Wallet size={16} className="text-blue-600" />
          <div className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
            Приём оплаты по аренде #{String(rental.id).padStart(4, "0")}
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
          {/* Сумма */}
          <div className="rounded-[10px] bg-blue-50 px-3 py-2.5">
            <div className="text-[11px] text-blue-700">К оплате</div>
            <div className="font-display text-[26px] font-extrabold tabular-nums text-blue-700">
              {fmt(sum)} ₽
            </div>
            <div className="text-[11px] text-blue-700/70">
              {rental.rate} ₽/сут × {rental.days} дн
            </div>
          </div>

          {/* Депозит */}
          {depositBalance > 0 && (
            <label className="flex items-start gap-2 rounded-[10px] border border-green-300 bg-green-soft/40 px-3 py-2 text-[12px] text-green-ink cursor-pointer">
              <input
                type="checkbox"
                checked={useDeposit}
                onChange={(e) => setUseDeposit(e.target.checked)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  Использовать депозит — {fmt(depositBalance)} ₽
                </div>
                <div className="text-[11px] opacity-80">
                  {useDeposit
                    ? `Зачтём ${fmt(depositToUse)} ₽. Остаток депозита после: ${fmt(depositBalance - depositToUse + overpay)} ₽.`
                    : "Депозит не будет использован."}
                </div>
              </div>
            </label>
          )}

          {/* Принято */}
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Принято от клиента, ₽
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={acceptedStr}
              onChange={(e) =>
                setAcceptedStr(e.target.value.replace(/[^\d]/g, ""))
              }
              className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[16px] font-semibold tabular-nums text-ink outline-none focus:border-blue-600"
            />
          </div>

          {/* Метод */}
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Способ
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={cn(
                    "rounded-[10px] border px-2.5 py-1.5 text-[12px] font-semibold transition-colors",
                    method === m.id
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-border bg-white text-ink-2 hover:border-blue-400",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Превью распределения */}
          <div className="rounded-[10px] bg-surface-soft px-3 py-2 text-[12px]">
            <div className="font-semibold text-ink">Будет проведено</div>
            <div className="mt-1 flex flex-col gap-0.5 text-muted">
              {depositToUse > 0 && (
                <Row label="Из депозита" value={`− ${fmt(depositToUse)} ₽`} />
              )}
              {accepted > 0 && (
                <Row
                  label={`Принято (${METHODS.find((m) => m.id === method)?.label})`}
                  value={`+ ${fmt(accepted)} ₽`}
                />
              )}
              <div className="mt-1 flex justify-between border-t border-border pt-1 text-ink">
                <span className="font-semibold">Зачтено в аренду</span>
                <span className="tabular-nums font-semibold">
                  {fmt(Math.min(sum, totalReceived))} ₽
                </span>
              </div>
              {overpay > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Переплата → депозит</span>
                  <span className="tabular-nums">+ {fmt(overpay)} ₽</span>
                </div>
              )}
              {underpay > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Недоплата (висит за клиентом)</span>
                  <span className="tabular-nums">{fmt(underpay)} ₽</span>
                </div>
              )}
            </div>
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
            onClick={submit}
            disabled={saving || (totalReceived <= 0 && sum > 0)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-[12px] font-bold text-white",
              saving || (totalReceived <= 0 && sum > 0)
                ? "cursor-not-allowed bg-surface text-muted-2"
                : "bg-blue-600 hover:bg-blue-700",
            )}
          >
            <Check size={13} /> Принять оплату
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
