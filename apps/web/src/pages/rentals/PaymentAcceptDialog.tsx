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
import { useQueryClient } from "@tanstack/react-query";
import { Check, X, Wallet, Shield, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { api } from "@/lib/api";
import { useApiClients } from "@/lib/api/clients";
import { useApiPayments } from "@/lib/api/payments";
import { useRentalDebt } from "@/lib/api/debt";
import { extendInplaceAsync } from "./rentalsStore";
import type { Rental } from "@/lib/mock/rentals";
import type { PaymentMethod } from "@/lib/mock/rentals";
import {
  periodForDays,
} from "@/lib/mock/rentals";

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
  const overdueDaysBalanceRaw = debt?.overdueDaysBalance ?? 0;
  const overdueFineBalanceRaw = debt?.overdueFineBalance ?? 0;
  const damageBalance = debt?.damageBalance ?? 0;
  const manualBalance = debt?.manualBalance ?? 0;

  // v0.4.49: ДВЕ независимые галки про просрочку.
  //  - countOverdueFine=true (default) → штраф 50% входит в «К оплате»
  //  - countOverdueDays=true (default) → дни просрочки входят в «К оплате»
  // Снятие любой → forgive соответствующего kind перед distribute.
  // Чекбоксы показываются только если есть начисленная просрочка.
  const hasOverdueFine = overdueFineBalanceRaw > 0;
  const hasOverdueDays = overdueDaysBalanceRaw > 0;
  const hasOverdue = hasOverdueFine || hasOverdueDays;
  const [countOverdueFine, setCountOverdueFine] = useState<boolean>(true);
  const [countOverdueDays, setCountOverdueDays] = useState<boolean>(true);
  const overdueDaysBalance = countOverdueDays ? overdueDaysBalanceRaw : 0;
  const overdueFineBalance = countOverdueFine ? overdueFineBalanceRaw : 0;

  // v0.4.79: переплата может пойти в депозит или в продление.
  // Заменяет старый Mode toggle «Только оплата / Оплата с продлением» —
  // теперь оператор сначала вводит сумму, потом видит что делать с
  // переплатой.
  type OverpayDest = "deposit" | "extend";
  const [overpayDest, setOverpayDest] = useState<OverpayDest>("deposit");

  // Параметры продления — авто-расчёт по тарифу аренды.
  // Оператор может править вручную через extInputOverride (по умолчанию null).
  const [extInputOverride, setExtInputOverride] = useState<number | null>(null);
  const [extCustomMode, setExtCustomMode] = useState<boolean>(false);
  const [extCustomUnit, setExtCustomUnit] = useState<"day" | "week">("day");
  const [extCustomRate, setExtCustomRate] = useState<number>(0);
  // Тариф продления = тариф аренды, если оператор не включил custom
  const extIsWeekly = extCustomMode
    ? extCustomUnit === "week"
    : rental.rateUnit === "week";
  const extRate = extCustomMode
    ? Math.max(0, extCustomRate)
    : rental.rate;
  const extDailyRate = extIsWeekly ? Math.round(extRate / 7) : extRate;
  // Долги (без extend — он считается по переплате)
  const totalDebt =
    pendingRent +
    overdueDaysBalance +
    overdueFineBalance +
    damageBalance +
    manualBalance;
  const dueAmount = totalDebt;

  // Источники
  // v0.4.80: useDeposit теперь работает И когда долгов нет — оператор
  // может взять депозит и пустить его в продление. Раньше depositToUse
  // = min(depositBalance, dueAmount) → если dueAmount=0, депозит не
  // использовался, и блок «В продление» не появлялся.
  const [useDeposit, setUseDeposit] = useState<boolean>(depositBalance > 0);
  const [useDepositAmountStr, setUseDepositAmountStr] = useState<string>("");
  const depositToUseRaw =
    useDeposit ? Number(useDepositAmountStr.replace(/\D/g, "")) : 0;
  const depositToUse = useDeposit
    ? Math.min(
        depositBalance,
        depositToUseRaw > 0 ? depositToUseRaw : depositBalance,
      )
    : 0;
  const remainingAfterDeposit = Math.max(0, dueAmount - depositToUse);

  // v0.4.49: залог можно списать ТОЛЬКО на ущерб/просрочку, нельзя на
  // rent/manual. depositItem != null → залог-предмет, кнопки нет вообще.
  // Если в долге только rent (нет overdue/damage) — кнопка тоже скрыта.
  const securityMax = rental.deposit ?? 0;
  const isDepositItem = (rental as { depositItem?: string | null }).depositItem != null;
  const securityCoverable =
    overdueDaysBalance + overdueFineBalance + damageBalance;
  const securityAllowed =
    !isDepositItem && securityMax > 0 && securityCoverable > 0;
  const [useSecurity, setUseSecurity] = useState<boolean>(false);
  const [securityStr, setSecurityStr] = useState<string>("0");
  const securityToUse =
    securityAllowed && useSecurity
      ? Math.min(
          securityMax,
          securityCoverable,
          Math.max(0, Number(securityStr.replace(/\D/g, "")) || 0),
        )
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

  // v0.4.79: автоматический расчёт продления по переплате.
  // Если overpayDest='extend' — overpay делится на extDailyRate (или
  // weeklyRate), целое количество идёт в продление, остаток в депозит.
  // Оператор может переопределить число дней/недель через extInputOverride.
  const extEnabled = overpay > 0 && overpayDest === "extend";
  const extAutoUnits = extEnabled
    ? Math.floor(overpay / Math.max(1, extIsWeekly ? extRate : extDailyRate))
    : 0;
  const extInput = extInputOverride ?? Math.max(1, extAutoUnits);
  const extDays = extIsWeekly ? extInput * 7 : extInput;
  const extWeeks = extIsWeekly ? extInput : 0;
  const extEffectivePeriod = extIsWeekly
    ? ("week" as const)
    : periodForDays(extDays);
  const extSum = extIsWeekly ? extRate * extWeeks : extDailyRate * extDays;
  // Остаток после продления → в депозит
  const extResidualToDeposit = Math.max(0, overpay - extSum);

  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

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
    const queue: {
      cap: number;
      target: OpTarget;
      damageReportId?: number;
    }[] = [
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
    // v0.4.49: rent от продления — отдельный target, добавляем в очередь
    // последним перед излишком. Маркер damageReportId=-1 — чтобы submit()
    // понимал что это продление и вызывал extend-inplace вместо обычного
    // payment(rent).
    if (extEnabled && extSum > 0) {
      queue.push({ cap: extSum, target: "rent", damageReportId: -1 });
    }

    // Шаг 2 — funding-источники в порядке списания.
    // Security-залог НЕЛЬЗЯ использовать на rent и manual — только
    // на ущерб/просрочку. Поэтому обрабатываем его отдельно «съев»
    // только подходящие slots, остаток (если есть) в funding-цепочку
    // НЕ пускаем (вернётся в rental.deposit как излишек security).
    const ops: Op[] = [];

    // 2A — security: только overdue_*/damage
    let secLeft = securityToUse;
    if (secLeft > 0) {
      for (const slot of queue) {
        if (secLeft <= 0) break;
        if (
          slot.target !== "overdue_days" &&
          slot.target !== "overdue_fine" &&
          slot.target !== "damage"
        )
          continue;
        if (slot.cap <= 0) continue;
        const take = Math.min(secLeft, slot.cap);
        ops.push({
          target: slot.target,
          amount: take,
          damageReportId: slot.damageReportId,
          method: "deposit",
        });
        slot.cap -= take;
        secLeft -= take;
      }
    }

    // 2B — основной funding: clientDeposit → accepted
    const funding: { amount: number; method: PaymentMethod }[] = [
      { amount: depositToUse, method: "deposit" },
      { amount: accepted, method },
    ];
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

    // Излишек cash/deposit-balance → депозит клиента
    let leftover = 0;
    if (fundLeft > 0) leftover += fundLeft;
    while (fundIdx < funding.length - 1) {
      fundIdx++;
      leftover += funding[fundIdx]!.amount;
    }
    if (leftover > 0) {
      ops.push({ target: "deposit", amount: leftover, method: "cash" });
    }
    // Излишек security НЕ выливается в депозит клиента — он просто
    // остаётся в rental.deposit (мы списали меньше чем оператор ввёл).
    // На UI «Списано с залога» = securityToUse − secLeft.
    return ops;
  };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // v0.4.49: 0. Раздельное списание просрочки по галкам.
      //   - !countOverdueFine && hasOverdueFine → forgive(target='fine')
      //   - !countOverdueDays && hasOverdueDays → forgive(target='days')
      //   - оба сняты → target='all' (одним запросом).
      const wantWaiveDays = !countOverdueDays && hasOverdueDays;
      const wantWaiveFine = !countOverdueFine && hasOverdueFine;
      if (wantWaiveDays && wantWaiveFine) {
        await api.post(`/api/rentals/${rental.id}/debt/forgive-overdue`, {
          target: "all",
          comment:
            "Прощение просрочки целиком при приёме оплаты (предупредил заранее)",
        });
      } else if (wantWaiveDays) {
        await api.post(`/api/rentals/${rental.id}/debt/forgive-overdue`, {
          target: "days",
          comment: "Прощение просроченных дней при приёме оплаты",
        });
      } else if (wantWaiveFine) {
        await api.post(`/api/rentals/${rental.id}/debt/forgive-overdue`, {
          target: "fine",
          comment: "Прощение штрафа просрочки при приёме оплаты",
        });
      }
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
      // 3. Выполнить распределение всех принятых средств.
      // v0.4.77: ПОРЯДОК ВАЖЕН. Раньше extend шёл ДО payment-операций,
      // и overdue_days_payment не сдвигал endPlanned (его уже сдвинул
      // extend в будущее). Теперь:
      //   3a. Платежи по просрочке/штрафу/manual/damage — сдвигают
      //       endPlanned до today (компенсируют просроченные дни).
      //   3b. extendInplaceAsync — сдвигает дальше за продление,
      //       создаёт rent placeholder paid=false.
      //   3c. Платежи по rent — PATCH placeholder paid=true.
      const ops = distribute();
      // Первый проход: всё кроме rent.
      for (const op of ops) {
        if (op.amount <= 0) continue;
        if (op.target === "rent") continue; // отложено
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
        } else if (op.target === "deposit") {
          await api.post(`/api/clients/${rental.clientId}/deposit/charge`, {
            amount: op.amount,
            comment: `Переплата по аренде #${rental.id}`,
            rentalId: rental.id,
          });
        }
      }

      // 3b. Extend (после payments просрочки → endPlanned уже на today,
      // extend сдвинет дальше).
      if (extEnabled && extSum > 0) {
        await extendInplaceAsync(
          rental.id,
          extDays,
          extRate,
          extEffectivePeriod,
          extIsWeekly ? "week" : "day",
          false, // autoMarkPaid=false → rent payment paid=false placeholder
        );
      }

      // 3c. Получаем unpaid rent placeholders (после extend) для PATCH.
      const freshPayments = await api.get<{
        items: Array<{
          id: number;
          rentalId: number;
          type: string;
          amount: number;
          paid: boolean;
        }>;
      }>(`/api/payments?rentalId=${rental.id}`);
      const unpaidRent = (freshPayments.items ?? [])
        .filter((p) => p.rentalId === rental.id && p.type === "rent" && !p.paid)
        .sort((a, b) => a.id - b.id);

      // Второй проход: только rent.
      for (const op of ops) {
        if (op.amount <= 0 || op.target !== "rent") continue;
        {
          // v0.4.50: вместо POST нового rent-платежа PATCH'аем
          // существующие placeholder'ы paid=false (созданные
          // extend-inplace или другими flow). FIFO по id —
          // погашаем старые в первую очередь.
          //
          // Если placeholder.amount <= op.amount → PATCH paid=true,
          //   списываем его сумму с op.amount.
          // Если placeholder.amount > op.amount → разделяем:
          //   PATCH placeholder.amount -= op.amount (остаток в долг),
          //   POST новый paid=true с op.amount.
          // Если placeholder'ов не хватило → POST новый paid=true.
          let amountLeft = op.amount;
          while (amountLeft > 0 && unpaidRent.length > 0) {
            const ph = unpaidRent[0]!;
            if (ph.amount <= amountLeft) {
              await api.patch(`/api/payments/${ph.id}`, {
                paid: true,
                paidAt: new Date().toISOString(),
                method: op.method,
              });
              amountLeft -= ph.amount;
              unpaidRent.shift();
            } else {
              // Частичное погашение placeholder: уменьшаем его сумму
              // на amountLeft, создаём отдельный paid=true на amountLeft.
              await api.patch(`/api/payments/${ph.id}`, {
                amount: ph.amount - amountLeft,
              });
              await api.post("/api/payments", {
                rentalId: rental.id,
                type: "rent",
                amount: amountLeft,
                method: op.method,
                paid: true,
                paidAt: new Date().toISOString(),
              });
              ph.amount = ph.amount - amountLeft;
              amountLeft = 0;
            }
          }
          // Остаток (placeholder'ов не было или мало) — новый paid=true
          if (amountLeft > 0) {
            await api.post("/api/payments", {
              rentalId: rental.id,
              type: "rent",
              amount: amountLeft,
              method: op.method,
              paid: true,
              paidAt: new Date().toISOString(),
            });
          }
        }
      }

      // v0.4.50: инвалидируем все связанные queries — фронт сразу
      // подтянет актуальные данные (payments, debt-summary, аренды).
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["rentals"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
      // Долг по этой аренде
      qc.invalidateQueries({ queryKey: ["rental-debt", rental.id] });
      // v0.4.51: агрегат долгов — обновляет KPI «Просрочено» и список
      // клиентов «С долгом» по всей CRM.
      qc.invalidateQueries({ queryKey: ["debt-aggregate"] });

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
  if (extEnabled && extSum > 0)
    debtParts.push({
      label: `продление ${extDays}${extIsWeekly ? `=${extWeeks}нед` : "дн"}`,
      amount: extSum,
    });

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

          {/* v0.4.49: ДВЕ независимые галки — учитывать штраф / учитывать
              дни просрочки. По умолчанию обе ✅ — стандартный сценарий
              «клиент-должник платит всё». Снятие = forgive соответствующего
              kind в submit (бэк создаёт debt_entry). Подпись рядом
              показывает фактическую сумму компонента и количество дней. */}
          {hasOverdue && (
            <div className="flex flex-col gap-2 rounded-[10px] border border-amber-200 bg-amber-50/30 px-3 py-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                Просрочка по аренде
              </div>
              {hasOverdueDays && (
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={countOverdueDays}
                    onChange={(e) => setCountOverdueDays(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-amber-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-ink">
                      Учитывать просроченные дни ·{" "}
                      <span className="text-amber-700 tabular-nums">
                        {fmt(overdueDaysBalanceRaw)} ₽
                      </span>
                      {(debt?.overdueDays ?? 0) > 0 && (
                        <span className="text-[11px] font-normal text-muted-2">
                          {" "}
                          ({rental.rate} ₽/{rental.rateUnit === "week" ? "нед" : "сут"} ×{" "}
                          {debt?.overdueDays ?? 0} дн)
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-muted-2">
                      Снять — клиент-«свой», стоимость дней не считаем.
                    </div>
                  </div>
                </label>
              )}
              {hasOverdueFine && (
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={countOverdueFine}
                    onChange={(e) => setCountOverdueFine(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-amber-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-ink">
                      Учитывать штраф просрочки ·{" "}
                      <span className="text-amber-700 tabular-nums">
                        {fmt(overdueFineBalanceRaw)} ₽
                      </span>
                      {(debt?.overdueDays ?? 0) > 0 && (
                        <span className="text-[11px] font-normal text-muted-2">
                          {" "}
                          (50% × {debt?.overdueDays ?? 0} дн)
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-muted-2">
                      Снять — клиент предупредил, штрафной % не считаем.
                    </div>
                  </div>
                </label>
              )}
            </div>
          )}

          {/* v0.4.79: переплата → выбор «в депозит / в продление». */}
          {overpay > 0 && (
            <div className="flex flex-col gap-2 rounded-[10px] border border-blue-200 bg-blue-50/30 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                  Переплата · {fmt(overpay)} ₽
                </div>
              </div>
              <div className="flex gap-1.5">
                {(
                  [
                    { id: "deposit" as const, label: "В депозит клиента", icon: Wallet },
                    { id: "extend" as const, label: "В продление аренды", icon: Repeat },
                  ]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setOverpayDest(opt.id);
                      setExtInputOverride(null);
                    }}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                      overpayDest === opt.id
                        ? "border-blue-500 bg-blue-600 text-white"
                        : "border-border bg-white text-ink-2 hover:border-blue-400",
                    )}
                  >
                    <opt.icon size={12} />
                    {opt.label}
                  </button>
                ))}
              </div>
              {/* В депозит — просто описание */}
              {overpayDest === "deposit" && (
                <div className="text-[11px] text-blue-700/80">
                  {fmt(overpay)} ₽ положим на депозит клиента — пойдут в счёт
                  будущих аренд / продлений / штрафов.
                </div>
              )}
              {/* В продление — авто-расчёт */}
              {overpayDest === "extend" && (
                <>
                  <div className="text-[11px] text-blue-700">
                    {extEnabled && extAutoUnits > 0 ? (
                      <>
                        Авто-расчёт по тарифу {extDailyRate} ₽/сут
                        {rental.rateUnit === "week" ? " (тариф недельный)" : ""}:
                        <b> {extDays} дн{extIsWeekly ? ` (${extWeeks} нед)` : ""}</b>
                        {" · "}
                        <b>{fmt(extSum)} ₽</b>
                        {extResidualToDeposit > 0 && (
                          <>
                            {" "}
                            · остаток <b>{fmt(extResidualToDeposit)} ₽</b> → в
                            депозит
                          </>
                        )}
                      </>
                    ) : (
                      <span className="text-orange-ink">
                        Переплата меньше дневной ставки — продление невозможно,
                        положим в депозит.
                      </span>
                    )}
                  </div>
                  {extAutoUnits > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted">
                        {extIsWeekly ? `Недель (= ${extDays} дн)` : "Дней"}
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={extInput}
                        onChange={(e) =>
                          setExtInputOverride(
                            Math.max(1, Number(e.target.value) || 1),
                          )
                        }
                        className="h-7 w-16 rounded-[6px] border border-border bg-white px-2 text-[12px] tabular-nums outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setExtInputOverride(null)}
                        className="text-[10px] text-blue-600 hover:underline"
                        title="Сбросить ручную правку — авто-расчёт по переплате"
                      >
                        авто
                      </button>
                    </div>
                  )}
                </>
              )}
              <label className="flex cursor-pointer items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  checked={extCustomMode}
                  onChange={(e) => setExtCustomMode(e.target.checked)}
                  className="h-3.5 w-3.5 accent-blue-600"
                />
                Произвольный тариф
              </label>
              {extCustomMode && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    // v0.4.72: показываем пусто если 0, чтобы оператор
                    // мог сразу набирать сумму без удаления нолика.
                    value={extCustomRate === 0 ? "" : extCustomRate}
                    onChange={(e) =>
                      setExtCustomRate(Math.max(0, Number(e.target.value) || 0))
                    }
                    onFocus={(e) => e.currentTarget.select()}
                    placeholder="0"
                    className="h-7 w-24 rounded-[6px] border border-border bg-white px-2 text-[12px] tabular-nums outline-none focus:border-blue-500"
                  />
                  <div className="inline-flex rounded-[6px] bg-white p-0.5 ring-1 ring-border">
                    {(["day", "week"] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setExtCustomUnit(u)}
                        className={cn(
                          "rounded-[4px] px-2 py-0.5 text-[10px] font-semibold transition-colors",
                          extCustomUnit === u
                            ? "bg-blue-600 text-white"
                            : "text-muted hover:text-ink",
                        )}
                      >
                        {u === "day" ? "₽/сут" : "₽/нед"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-[10px] text-blue-700/70">
                После продления endPlannedAt увеличится на {extDays} дн.
                Текущая аренда продолжается, без отдельной «новой».
              </div>
            </div>
          )}

          {/* Депозит клиента */}
          {depositBalance > 0 && (
            <div className="rounded-[10px] border border-green-300 bg-green-soft/40 px-3 py-2 text-[12px] text-green-ink">
              <label className="flex items-start gap-2 cursor-pointer">
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
              {useDeposit && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] opacity-80">Сумма с депозита:</span>
                  <input
                    type="number"
                    min={0}
                    max={depositBalance}
                    value={useDepositAmountStr}
                    onChange={(e) =>
                      setUseDepositAmountStr(
                        e.target.value.replace(/\D/g, ""),
                      )
                    }
                    placeholder={`всё (${fmt(depositBalance)})`}
                    className="h-7 w-32 rounded-[6px] border border-green-300 bg-white px-2 text-[12px] tabular-nums outline-none focus:border-green-600"
                  />
                </div>
              )}
            </div>
          )}

          {/* Залог. v0.4.49: видим только когда:
              - залог денежный (не предмет)
              - есть что покрывать из залога (overdue/damage в долге)
              На rent/manual залог ставить нельзя по бизнес-правилу. */}
          {securityAllowed && (
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
                    <Shield size={12} /> Списать с залога — макс {fmt(Math.min(securityMax, securityCoverable))} ₽
                  </div>
                  <div className="text-[11px] opacity-80">
                    Только в счёт ущерба и просрочки. Аренду из залога
                    оплатить нельзя — он остаётся как страховой счёт.
                  </div>
                </div>
              </label>
              {useSecurity && (
                <>
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
                      onClick={() =>
                        setSecurityStr(
                          String(Math.min(securityMax, securityCoverable)),
                        )
                      }
                      className="ml-auto rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold hover:bg-amber-200"
                    >
                      Покрыть полностью
                    </button>
                  </div>
                  {/* v0.4.81: показываем что останется в залоге к выдаче
                      клиенту при завершении аренды без ущерба. */}
                  <div className="mt-1.5 flex items-center justify-between text-[11px] opacity-90">
                    <span>Останется в залоге (вернётся клиенту при сдаче):</span>
                    <span className="tabular-nums font-semibold">
                      {fmt(Math.max(0, securityMax - securityToUse))} ₽
                    </span>
                  </div>
                </>
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
