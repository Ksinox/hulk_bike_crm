/**
 * v0.4.26 — диалог приёма оплаты по аренде.
 *
 * При наличии долга (просрочка / ущерб / ручной / неоплаченная аренда)
 * «К оплате» = СУММА ДОЛГА (а не sum аренды). Раньше показывали
 * rental.sum даже когда был долг — оператор не видел сразу сколько
 * клиент должен и приходилось руками считать.
 *
 * Источники средств:
 *  • Депозит клиента — переплаты из прошлых сделок (clients.deposit_balance)
 *  • Залог — деньги внесённые в начале аренды (rentals.deposit). Можно
 *    списать частично/целиком, если клиент проблемный — залог не вернётся.
 *  • Принято от клиента — сумма + способ (нал/карта/перевод)
 *
 * Распределение по приоритету:
 *  1. Просрочка дни (overdue_days)
 *  2. Просрочка штраф (overdue_fine)
 *  3. Ущерб (damage_reports)
 *  4. Ручной долг (manual_charge)
 *  5. Неоплаченная аренда (rent payments)
 *  6. Излишек → депозит клиента
 */
import { useEffect, useMemo, useState } from "react";
import { Check, X, Wallet, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { api } from "@/lib/api";
import { useApiClients } from "@/lib/api/clients";
import { useApiPayments } from "@/lib/api/payments";
import { useRentalDebt } from "@/lib/api/debt";
import type { Rental } from "@/lib/mock/rentals";
import type { PaymentMethod } from "@/lib/mock/rentals";

// v0.4.30: терминала для карт у бизнеса нет — только наличные и
// перевод. «card» остаётся в типе PaymentMethod ради обратной
// совместимости с историческими записями в БД, но в UI-селекторах
// больше не показывается.
const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "cash", label: "Наличные" },
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
  const { data: payments = [] } = useApiPayments();
  const debtQ = useRentalDebt(rental.id);
  const debt = debtQ.data;

  // Неоплаченная аренда (rent payments paid=false)
  const pendingRent = useMemo(() => {
    return payments
      .filter(
        (p) =>
          p.rentalId === rental.id && p.type === "rent" && !p.paid,
      )
      .reduce((s, p) => s + p.amount, 0);
  }, [payments, rental.id]);

  // Компоненты долга — берём из API debt summary
  const overdueDaysBalance = debt?.overdueDaysBalance ?? 0;
  const overdueFineBalance = debt?.overdueFineBalance ?? 0;
  const damageBalance = debt?.damageBalance ?? 0;
  const manualBalance = debt?.manualBalance ?? 0;
  const totalDebt =
    pendingRent +
    overdueDaysBalance +
    overdueFineBalance +
    damageBalance +
    manualBalance;

  // «К оплате» — приоритетно долг. Если долгов нет — sum аренды (предоплата).
  const dueAmount = totalDebt > 0 ? totalDebt : rental.sum;

  // Источники
  const [useDeposit, setUseDeposit] = useState<boolean>(depositBalance > 0);
  const depositToUse = useDeposit ? Math.min(depositBalance, dueAmount) : 0;
  const remainingAfterDeposit = Math.max(0, dueAmount - depositToUse);

  const securityMax = rental.deposit ?? 0;
  const [useSecurity, setUseSecurity] = useState<boolean>(false);
  const [securityStr, setSecurityStr] = useState<string>("0");
  const securityToUse = useSecurity
    ? Math.min(securityMax, Math.max(0, Number(securityStr.replace(/\D/g, "")) || 0))
    : 0;
  const remainingAfterSecurity = Math.max(0, remainingAfterDeposit - securityToUse);

  const [acceptedStr, setAcceptedStr] = useState<string>(
    String(remainingAfterSecurity),
  );
  // Sync «принято» при изменении источников
  useEffect(() => {
    setAcceptedStr(String(remainingAfterSecurity));
  }, [remainingAfterSecurity]);

  const accepted = Number(acceptedStr.replace(/\D/g, "")) || 0;
  const totalReceived = depositToUse + securityToUse + accepted;
  const overpay = Math.max(0, totalReceived - dueAmount);
  const underpay = Math.max(0, dueAmount - totalReceived);

  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [saving, setSaving] = useState(false);

  const fmt = (n: number) => n.toLocaleString("ru-RU");

  type OpTarget =
    | "overdue_days"
    | "overdue_fine"
    | "damage"
    | "manual"
    | "rent"
    | "deposit";
  type Op = {
    target: OpTarget;
    amount: number;
    damageReportId?: number;
    /** v0.4.34: способ — какими деньгами профинансирован этот суб-платёж.
     *  'deposit' — за счёт залога/депозита, не попадает в revenue.
     *  cash/transfer — реально принято от клиента. */
    method: PaymentMethod;
  };

  /**
   * v0.4.34: распределяет ВСЕ принятые средства по приоритету
   * (overdue_days → overdue_fine → damage → manual → rent → излишек),
   * при этом каждую операцию помечает method'ом по источнику денег:
   *  - первые depositToUse рублей → method='deposit'
   *  - следующие securityToUse рублей → method='deposit'
   *  - остаток (accepted) → method выбранный оператором
   * Это нужно чтобы revenue не задваивался: залог/депозит уже были
   * учтены раньше, повторный учёт исключается фильтром revenue.ts.
   */
  const distribute = (): Op[] => {
    // Шаг 1 — разложили общий totalReceived на «что именно платим»
    const queue: { cap: number; target: OpTarget; damageReportId?: number }[] =
      [
        { cap: overdueDaysBalance, target: "overdue_days" },
        { cap: overdueFineBalance, target: "overdue_fine" },
      ];
    for (const dr of debt?.damageReports ?? []) {
      const reportPaid = payments
        .filter(
          (p) =>
            p.rentalId === rental.id &&
            p.type === "damage" &&
            p.paid &&
            p.damageReportId === dr.id,
        )
        .reduce((s, p) => s + p.amount, 0);
      const reportDebt = Math.max(0, dr.total - dr.depositCovered - reportPaid);
      queue.push({ cap: reportDebt, target: "damage", damageReportId: dr.id });
    }
    queue.push({ cap: manualBalance, target: "manual" });
    queue.push({ cap: pendingRent, target: "rent" });

    // Шаг 2 — funding-источники в порядке списания
    const funding: { amount: number; method: PaymentMethod }[] = [
      { amount: depositToUse, method: "deposit" },
      { amount: securityToUse, method: "deposit" },
      { amount: accepted, method },
    ];

    const ops: Op[] = [];
    let fundIdx = 0;
    let fundLeft = funding[0]?.amount ?? 0;
    let fundMethod: PaymentMethod = funding[0]?.method ?? method;

    const advanceFund = () => {
      while (fundLeft <= 0 && fundIdx < funding.length - 1) {
        fundIdx++;
        fundLeft = funding[fundIdx]!.amount;
        fundMethod = funding[fundIdx]!.method;
      }
    };
    advanceFund();

    for (const slot of queue) {
      let slotLeft = slot.cap;
      while (slotLeft > 0 && (fundLeft > 0 || fundIdx < funding.length - 1)) {
        if (fundLeft === 0) advanceFund();
        if (fundLeft === 0) break;
        const take = Math.min(slotLeft, fundLeft);
        ops.push({
          target: slot.target,
          amount: take,
          damageReportId: slot.damageReportId,
          method: fundMethod,
        });
        slotLeft -= take;
        fundLeft -= take;
      }
      if (fundLeft === 0 && fundIdx >= funding.length - 1) break;
    }

    // Излишек → депозит клиента (если ещё остался funding после всех слотов).
    let leftover = 0;
    if (fundLeft > 0) leftover += fundLeft;
    while (fundIdx < funding.length - 1) {
      fundIdx++;
      leftover += funding[fundIdx]!.amount;
    }
    if (leftover > 0) {
      // Метод тут роли не играет — overpay идёт в clients.deposit_balance,
      // payment-запись не создаётся.
      ops.push({ target: "deposit", amount: leftover, method: "cash" });
    }
    return ops;
  };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // 1. Списать депозит клиента (clients.deposit_balance), если используется
      if (depositToUse > 0) {
        await api.post(
          `/api/clients/${rental.clientId}/deposit/spend`,
          {
            amount: depositToUse,
            comment: `В счёт долга по аренде #${rental.id}`,
            rentalId: rental.id,
          },
        );
      }
      // 2. Списать с залога (rental.deposit). v0.4.34: сам факт списания
      //    теперь оформлен через payment(method='deposit') в шаге 3 —
      //    PATCH здесь только уменьшает rental.deposit на сумму, чтобы
      //    залог не использовали повторно.
      if (securityToUse > 0) {
        const newDepositValue = Math.max(0, securityMax - securityToUse);
        await api.patch(`/api/rentals/${rental.id}`, {
          deposit: newDepositValue,
          note:
            (rental.note ?? "") +
            (rental.note ? " · " : "") +
            `с залога списано ${securityToUse} ₽ в счёт долга`,
        });
      }
      // 3. Выполнить распределение всех принятых средств
      const ops = distribute();
      for (const op of ops) {
        if (op.amount <= 0) continue;
        if (op.target === "overdue_days") {
          await api.post(`/api/rentals/${rental.id}/debt/payment`, {
            kind: "overdue_days_payment",
            amount: op.amount,
            comment: `Оплата клиента (${methodLabel(op.method)})`,
          });
        } else if (op.target === "overdue_fine") {
          await api.post(`/api/rentals/${rental.id}/debt/payment`, {
            kind: "overdue_fine_payment",
            amount: op.amount,
            comment: `Оплата клиента (${methodLabel(op.method)})`,
          });
        } else if (op.target === "damage") {
          await api.post("/api/payments", {
            rentalId: rental.id,
            type: "damage",
            amount: op.amount,
            method: op.method,
            paid: true,
            paidAt: new Date().toISOString(),
            damageReportId: op.damageReportId,
            note: "Оплата по акту",
          });
        } else if (op.target === "manual") {
          await api.post(`/api/rentals/${rental.id}/debt/payment`, {
            kind: "manual_payment",
            amount: op.amount,
            comment: `Оплата клиента (${methodLabel(op.method)})`,
          });
        } else if (op.target === "rent") {
          await api.post("/api/payments", {
            rentalId: rental.id,
            type: "rent",
            amount: op.amount,
            method: op.method,
            paid: true,
            paidAt: new Date().toISOString(),
          });
        } else if (op.target === "deposit") {
          await api.post(
            `/api/clients/${rental.clientId}/deposit/charge`,
            {
              amount: op.amount,
              comment: `Переплата по аренде #${rental.id}`,
              rentalId: rental.id,
            },
          );
        }
      }

      if (overpay > 0) {
        toast.success(
          "Оплата принята",
          `Долги погашены. Переплата ${fmt(overpay)} ₽ ушла в депозит.`,
        );
      } else if (underpay > 0) {
        toast.info(
          "Принят частичный платёж",
          `Зачтено в долг ${fmt(totalReceived)} ₽. Остаток ${fmt(underpay)} ₽ висит за клиентом.`,
        );
      } else {
        toast.success("Оплата принята", "Зачтено в погашение долгов.");
      }

      onPaid?.();
      requestClose();
    } catch (e) {
      toast.error("Не удалось принять оплату", (e as Error).message ?? "");
    } finally {
      setSaving(false);
    }
  };

  function methodLabel(m: PaymentMethod): string {
    if (m === "cash") return "наличные";
    if (m === "transfer") return "перевод";
    if (m === "deposit") return "из залога/депозита";
    return m;
  }

  const debtParts: { label: string; amount: number }[] = [];
  if (pendingRent > 0)
    debtParts.push({ label: "не оплачено", amount: pendingRent });
  if (overdueDaysBalance > 0)
    debtParts.push({ label: "просрочка дни", amount: overdueDaysBalance });
  if (overdueFineBalance > 0)
    debtParts.push({ label: "штраф просрочки", amount: overdueFineBalance });
  if (damageBalance > 0)
    debtParts.push({ label: "ущерб", amount: damageBalance });
  if (manualBalance > 0)
    debtParts.push({ label: "ручной долг", amount: manualBalance });

  return (
    <div
      className={cn(
        "fixed inset-0 z-[120] flex items-center justify-center bg-ink/55 p-6 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
    >
      <div
        className={cn(
          "w-full max-w-[520px] overflow-hidden rounded-2xl bg-surface shadow-card-lg",
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
              {fmt(dueAmount)} ₽
            </div>
            {debtParts.length > 0 ? (
              <div className="mt-0.5 text-[11px] text-blue-700/80">
                {debtParts
                  .map((d) => `${d.label} ${fmt(d.amount)} ₽`)
                  .join(" · ")}
              </div>
            ) : (
              <div className="mt-0.5 text-[11px] text-blue-700/70">
                {rental.rate} ₽/{rental.rateUnit === "week" ? "нед" : "сут"} ·{" "}
                {rental.days} дн (предоплата)
              </div>
            )}
          </div>

          {/* Депозит клиента */}
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
                  Депозит клиента — {fmt(depositBalance)} ₽
                </div>
                <div className="text-[11px] opacity-80">
                  {useDeposit
                    ? `Зачтём ${fmt(depositToUse)} ₽`
                    : "Не использовать"}
                </div>
              </div>
            </label>
          )}

          {/* Залог */}
          {securityMax > 0 && (
            <div className="rounded-[10px] border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useSecurity}
                  onChange={(e) => setUseSecurity(e.target.checked)}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <Shield size={12} /> Списать с залога — макс {fmt(securityMax)} ₽
                  </div>
                  <div className="text-[11px] opacity-80">
                    Использовать когда клиент не возвращает скутер или
                    отказывается платить. После списания залог уменьшится.
                  </div>
                </div>
              </label>
              {useSecurity && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={securityStr}
                    onChange={(e) =>
                      setSecurityStr(e.target.value.replace(/[^\d]/g, ""))
                    }
                    className="h-9 w-32 rounded-[8px] border border-border bg-white px-2 text-[13px] tabular-nums text-ink outline-none focus:border-blue-600"
                  />
                  <span className="text-[11px]">₽ из залога</span>
                  <button
                    type="button"
                    onClick={() => setSecurityStr(String(Math.min(securityMax, dueAmount)))}
                    className="ml-auto rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold hover:bg-amber-200"
                  >
                    Покрыть долг полностью
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Принято от клиента */}
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

          {/* Превью */}
          <div className="rounded-[10px] bg-surface-soft px-3 py-2 text-[12px]">
            <div className="font-semibold text-ink">Будет проведено</div>
            <div className="mt-1 flex flex-col gap-0.5 text-muted">
              {depositToUse > 0 && (
                <Row label="Из депозита клиента" value={`− ${fmt(depositToUse)} ₽`} />
              )}
              {securityToUse > 0 && (
                <Row label="Списано с залога" value={`− ${fmt(securityToUse)} ₽`} />
              )}
              {accepted > 0 && (
                <Row
                  label={`Принято (${METHODS.find((m) => m.id === method)?.label})`}
                  value={`+ ${fmt(accepted)} ₽`}
                />
              )}
              <div className="mt-1 flex justify-between border-t border-border pt-1 text-ink">
                <span className="font-semibold">Зачтено в долг/аренду</span>
                <span className="tabular-nums font-semibold">
                  {fmt(Math.min(dueAmount, totalReceived))} ₽
                </span>
              </div>
              {overpay > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Переплата → депозит клиента</span>
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
            disabled={saving || totalReceived <= 0}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-[12px] font-bold text-white",
              saving || totalReceived <= 0
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
