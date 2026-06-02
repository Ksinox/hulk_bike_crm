/**
 * Фокус-экран «Платёж». Один шаг — сумма + способ + live-предпросмотр.
 */
import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useDebtor, useRecordPayment } from "@/lib/api/debtors";
import type { PaymentMethod } from "@/lib/debtors/types";
import { toast } from "@/lib/toast";

export function DebtorPaymentScreen({
  id,
  paymentN,
  onClose,
}: {
  id: number;
  paymentN?: number;
  onClose: () => void;
}) {
  const q = useDebtor(id);
  const recordPay = useRecordPayment();

  // Целевой платёж: либо указанная строка графика, либо ближайший плановый.
  const target =
    paymentN != null
      ? q.data?.payments.find((p) => p.n === paymentN && p.paidAt == null)
      : undefined;
  const nextPlanned = target ?? q.data?.payments.find((p) => p.paidAt == null);
  const remaining = q.data ? q.data.totalAmount - q.data.paid : 0;

  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  // Как зачесть переплату, если сумма больше планового платежа.
  const [allocate, setAllocate] = useState<"term" | "total">("term");

  // Предзаполняем сумму: плановый платёж — его суммой; внеплановый
  // (графика нет или он весь оплачен) — остатком долга, чтобы оператор
  // сразу видел, сколько осталось, и мог принять досрочное погашение.
  useMemo(() => {
    if (q.data && !amount) {
      setAmount(
        String(nextPlanned ? nextPlanned.scheduledAmount : Math.max(0, remaining)),
      );
    }
  }, [q.data, nextPlanned, amount, remaining]);

  const numAmount = Math.floor(Number(amount.replace(/[^\d]/g, "")) || 0);
  const afterPaid = (q.data?.paid ?? 0) + numAmount;
  const afterPct = q.data
    ? Math.min(100, Math.round((afterPaid / q.data.totalAmount) * 100))
    : 0;
  const willClose = q.data ? afterPaid >= q.data.totalAmount : false;

  const overpay =
    nextPlanned != null && numAmount > nextPlanned.scheduledAmount;

  const submit = async () => {
    if (!q.data || numAmount <= 0) return;
    try {
      await recordPay.mutateAsync({
        id,
        amount: numAmount,
        method,
        paymentN: nextPlanned?.n,
        allocate: overpay ? allocate : undefined,
      });
      toast.success(
        "Платёж зафиксирован",
        `${numAmount.toLocaleString("ru-RU")} ₽ зачислено${willClose ? " · дело можно закрывать" : ""}`,
      );
      onClose();
    } catch (e) {
      toast.error("Не удалось", (e as Error).message);
    }
  };

  if (q.isLoading || !q.data) {
    return <div className="flex h-64 items-center justify-center text-muted">Загрузка…</div>;
  }

  const fmtNum = (n: number) =>
    Math.floor(n).toLocaleString("ru-RU");

  return (
    <section className="grid min-h-[600px] place-items-center bg-surface-soft p-10">
      <div className="w-full max-w-[520px] overflow-hidden rounded-[20px] bg-white shadow-card-lg">
        <header className="border-b border-border p-7 pb-5">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
            Платёж от <b className="font-bold text-ink">{q.data.displayName}</b> · дело {q.data.caseNumber}
          </div>
          <h3 className="m-0 font-display text-[28px] font-bold tracking-[-0.02em] text-ink">
            Сколько пришло?
          </h3>
          <div className="mt-1 text-[13px] text-muted">
            {nextPlanned
              ? `Предзаполнено суммой планового платежа #${nextPlanned.n}.`
              : `Досрочный / внеплановый платёж. Подставили остаток долга — ${fmtNum(remaining)} ₽, можно изменить.`}
          </div>
        </header>

        <div className="p-7">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Сумма
          </div>
          <div className="mb-3 flex items-baseline gap-2.5 rounded-[14px] border-2 border-ink bg-gradient-to-b from-white to-[#FAFBFD] px-5 py-3.5 shadow-[0_0_0_4px_rgba(11,18,32,0.06)]">
            <input
              inputMode="numeric"
              className="flex-1 min-w-0 border-none bg-transparent p-0 font-display text-[38px] font-bold leading-none tracking-[-0.022em] text-ink outline-none"
              value={amount}
              onChange={(e) =>
                setAmount(
                  e.target.value
                    .replace(/[^\d ]/g, "")
                    .replace(/\s+/g, " ")
                    .trim(),
                )
              }
            />
            <span className="font-display text-[32px] font-semibold leading-none text-muted-2">
              ₽
            </span>
          </div>

          <div className="mb-5 grid grid-cols-3 gap-1.5">
            {nextPlanned && (
              <button
                type="button"
                onClick={() => setAmount(String(nextPlanned.scheduledAmount))}
                className={`flex h-12 flex-col items-start justify-center gap-0.5 rounded-[11px] border px-3 text-left text-[12px] font-semibold ${
                  numAmount === nextPlanned.scheduledAmount
                    ? "border-ink bg-ink text-white"
                    : "border-border text-ink-2 hover:border-ink"
                }`}
              >
                Платёж {nextPlanned.n}
                <span className={`font-mono text-[10.5px] ${numAmount === nextPlanned.scheduledAmount ? "text-white/70" : "text-muted"}`}>
                  {fmtNum(nextPlanned.scheduledAmount)}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setAmount(String(remaining))}
              className={`flex h-12 flex-col items-start justify-center gap-0.5 rounded-[11px] border px-3 text-left text-[12px] font-semibold ${
                numAmount === remaining
                  ? "border-ink bg-ink text-white"
                  : "border-border text-ink-2 hover:border-ink"
              }`}
            >
              Закрыть всё
              <span className={`font-mono text-[10.5px] ${numAmount === remaining ? "text-white/70" : "text-muted"}`}>
                {fmtNum(remaining)}
              </span>
            </button>
          </div>

          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Способ
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMethod("transfer")}
              className={`flex items-center gap-3 rounded-[12px] border p-3.5 text-left ${
                method === "transfer"
                  ? "border-ink bg-ink text-white"
                  : "border-border hover:border-ink"
              }`}
            >
              <div
                className={`grid h-9 w-9 flex-none place-items-center rounded-[9px] ${
                  method === "transfer" ? "bg-white/15" : "bg-surface-soft"
                }`}
              >
                ↔
              </div>
              <div>
                <div className="text-[14px] font-semibold">Перевод</div>
                <div className={`mt-0.5 font-mono text-[11px] ${method === "transfer" ? "text-white/60" : "text-muted"}`}>
                  карта / СБП / р/с
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMethod("cash")}
              className={`flex items-center gap-3 rounded-[12px] border p-3.5 text-left ${
                method === "cash"
                  ? "border-ink bg-ink text-white"
                  : "border-border hover:border-ink"
              }`}
            >
              <div
                className={`grid h-9 w-9 flex-none place-items-center rounded-[9px] ${
                  method === "cash" ? "bg-white/15" : "bg-surface-soft"
                }`}
              >
                ₽
              </div>
              <div>
                <div className="text-[14px] font-semibold">Наличные</div>
                <div className={`mt-0.5 font-mono text-[11px] ${method === "cash" ? "text-white/60" : "text-muted"}`}>
                  в кассу магазина
                </div>
              </div>
            </button>
          </div>

          {/* Аллокация переплаты — как в банке: сократить срок или уменьшить остаток */}
          {overpay && (
            <div className="mt-5">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Сумма больше планового платежа — как зачесть?
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAllocate("term")}
                  className={`flex flex-col items-start rounded-[12px] border p-3 text-left ${
                    allocate === "term"
                      ? "border-ink bg-ink text-white"
                      : "border-border hover:border-ink"
                  }`}
                >
                  <span className="text-[13.5px] font-semibold">В счёт срока</span>
                  <span
                    className={`text-[11px] ${allocate === "term" ? "text-white/60" : "text-muted"}`}
                  >
                    закрыть ближайшие платежи
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setAllocate("total")}
                  className={`flex flex-col items-start rounded-[12px] border p-3 text-left ${
                    allocate === "total"
                      ? "border-ink bg-ink text-white"
                      : "border-border hover:border-ink"
                  }`}
                >
                  <span className="text-[13.5px] font-semibold">
                    В счёт всей суммы
                  </span>
                  <span
                    className={`text-[11px] ${allocate === "total" ? "text-white/60" : "text-muted"}`}
                  >
                    уменьшить общий остаток
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Impact */}
        <div className="border-t border-emerald-100 bg-gradient-to-br from-emerald-50 to-[#F7FEFA] p-7 pt-5">
          <div className="mb-2.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-emerald-700">
            ↓ что произойдёт
          </div>
          <div className="space-y-1 text-[13.5px]">
            <div className="flex justify-between">
              <span className="text-muted">Погашено</span>
              <b className="font-mono text-ink">
                {fmtNum(afterPaid)} / {fmtNum(q.data.totalAmount)} ₽
              </b>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Прогресс</span>
              <b className="font-mono text-ink">
                {afterPct}% · было {q.data.progressPercent}%
              </b>
            </div>
            {q.data.overdueDays > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">Просрочка</span>
                <b className="font-mono text-emerald-700">снимается</b>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-emerald-100 pt-2 text-[14px] font-semibold">
              <span className="text-ink-2">Статус дела</span>
              <b className="font-display text-[18px] font-bold text-emerald-700">
                {willClose ? "готово к закрытию" : "снова в графике"}
              </b>
            </div>
          </div>
        </div>

        <footer className="flex items-center gap-2.5 border-t border-border bg-surface-soft p-5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
          >
            <ArrowLeft size={13} />
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={numAmount <= 0 || recordPay.isPending}
            className="ml-auto inline-flex h-12 items-center gap-2 rounded-[12px] bg-ink px-6 text-[15px] font-semibold text-white shadow-[0_12px_20px_-8px_rgba(11,18,32,0.35)] disabled:opacity-40"
          >
            Сохранить
          </button>
        </footer>
      </div>
    </section>
  );
}
