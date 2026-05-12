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
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  X,
  Wallet,
  Shield,
  Repeat,
  Coins,
  Calendar as CalendarIcon,
  Shirt,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { api } from "@/lib/api";
import { useApiClients } from "@/lib/api/clients";
import { useApiPayments } from "@/lib/api/payments";
import { useRentalDebt } from "@/lib/api/debt";
import { extendInplaceAsync } from "./rentalsStore";
import { EquipmentChangeDialog } from "./EquipmentChangeDialog";
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
  initialExtDays,
}: {
  rental: Rental;
  onClose: () => void;
  onPaid?: () => void;
  /**
   * v0.6.1: предзаполнение числа дней продления при открытии
   * диалога. Используется при drag-to-extend на основном календаре:
   * RentalCard передаёт сюда число дней, диалог сразу показывает их
   * в поле «Продлить на N дней» и в overpay-блоке «В продление».
   */
  initialExtDays?: number;
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

  // v0.6.3: step-based UX — Step 1 «Сначала просрочка».
  // Две карточки-кнопки: «Погасить долг» / «Простить просрочку».
  // Жёстко связаны с countOverdueDays/Fine (бэкенд-логика не меняется):
  //   clearDebt=true  → countOverdueDays=true,  countOverdueFine=true
  //   forgiveDebt=true → countOverdueDays=false, countOverdueFine=false
  const overdueBalanceRaw = overdueDaysBalanceRaw + overdueFineBalanceRaw;
  const clearDebt = countOverdueDays || countOverdueFine;
  const forgiveDebt =
    hasOverdue && !countOverdueDays && !countOverdueFine;
  const setClearDebt = () => {
    if (hasOverdueDays) setCountOverdueDays(true);
    if (hasOverdueFine) setCountOverdueFine(true);
  };
  const setForgiveDebt = () => {
    if (hasOverdueDays) setCountOverdueDays(false);
    if (hasOverdueFine) setCountOverdueFine(false);
  };

  // v0.6.3: Step 2 — toggle режима ввода периода продления.
  // 'days' — спиннер + quick-presets.
  // 'amount' — оператор вводит «сколько даёт клиент» → пересчёт в дни.
  const [mode, setMode] = useState<"days" | "amount">("days");
  const [amountInput, setAmountInput] = useState<string>("");

  // v0.4.79: переплата может пойти в депозит или в продление.
  // Заменяет старый Mode toggle «Только оплата / Оплата с продлением» —
  // теперь оператор сначала вводит сумму, потом видит что делать с
  // переплатой.
  // v0.5.9: добавлен target 'security' — пополнение залога аренды.
  // Когда rental.deposit < depositOriginal — это default, оператор
  // часто пополняет именно его. Используется существующий endpoint
  // /security-topup (через api.post внутри submit).
  type OverpayDest = "deposit" | "extend" | "security";
  // Нужно ли пополнение залога? — флаг для UI и для дефолта overpayDest.
  const needsSecurityTopup =
    !rental.depositItem &&
    (rental.deposit ?? 0) <
      ((rental as { depositOriginal?: number }).depositOriginal ?? 0);
  // v0.5.9: дефолт зависит от ситуации. Если залог нужно пополнить —
  // приоритет на пополнение залога. Иначе — extend (продление).
  // v0.6.1: если пришёл prefill из drag-to-extend — целимся в «продление»
  // даже если залог недопополнен (явный жест пользователя в календаре).
  const [overpayDest, setOverpayDest] = useState<OverpayDest>(
    (initialExtDays ?? 0) > 0
      ? "extend"
      : needsSecurityTopup
        ? "security"
        : "extend",
  );

  // Параметры продления — авто-расчёт по тарифу аренды.
  // Оператор может править вручную через extInputOverride (по умолчанию null).
  // v0.6.1: при drag-to-extend инициализируем override переданным числом дней
  // (для week-тарифа округляем вверх до недель).
  const [extInputOverride, setExtInputOverride] = useState<number | null>(() => {
    if (!initialExtDays || initialExtDays <= 0) return null;
    if (rental.rateUnit === "week") {
      return Math.max(1, Math.ceil(initialExtDays / 7));
    }
    return initialExtDays;
  });
  // v0.6.3: custom-тариф убран из нового UX (Step 2 — фиксированный
  // тариф аренды). Тариф продления = тариф аренды.
  const extIsWeekly = rental.rateUnit === "week";
  const extRate = rental.rate;
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

  // v0.4.83: «Принято от клиента» — пустое поле когда сумма 0, чтоб
  // оператор не стирал нолик при наборе. Внутри в submit пустая строка
  // = 0.
  // v0.6.1: при drag-to-extend поле сразу заполняется на сумму долга +
  // стоимость продления (extDays × dailyRate). Это превращает дёрг
  // календаря в готовый payload — оператору остаётся только подтвердить.
  const prefillExtensionSum = (() => {
    if (!initialExtDays || initialExtDays <= 0) return 0;
    const isWeek = rental.rateUnit === "week";
    const dayRate = isWeek ? Math.round(rental.rate / 7) : rental.rate;
    return dayRate * initialExtDays;
  })();
  const [acceptedStr, setAcceptedStr] = useState<string>(() => {
    const initial = remainingAfterSecurity + prefillExtensionSum;
    return initial > 0 ? String(initial) : "";
  });
  // v0.6.1: «следили ли мы за initial-extension prefill уже один раз».
  // Без флага useEffect ниже мгновенно затёр бы prefill сразу после
  // монтажа (remainingAfterSecurity вычисляется на 2-м рендере).
  const extPrefilledRef = useRef<boolean>((initialExtDays ?? 0) > 0);
  // Sync «принято» при изменении источников. Если становится 0 — пустая.
  // Первый эффект пропускаем, если был prefill — иначе оператор увидит
  // суммы долга без надбавки за продление.
  useEffect(() => {
    if (extPrefilledRef.current) {
      extPrefilledRef.current = false;
      return;
    }
    // v0.6.3: в amount-mode синхронизацию делает отдельный effect ниже.
    if (mode === "amount") return;
    setAcceptedStr(
      remainingAfterSecurity > 0 ? String(remainingAfterSecurity) : "",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingAfterSecurity, mode]);

  const accepted = Number(acceptedStr.replace(/\D/g, "")) || 0;
  const totalReceived = depositToUse + securityToUse + accepted;
  const overpay = Math.max(0, totalReceived - dueAmount);
  const underpay = Math.max(0, dueAmount - totalReceived);

  // v0.4.79: автоматический расчёт продления по переплате.
  // Если overpayDest='extend' — overpay делится на extDailyRate (или
  // weeklyRate), целое количество идёт в продление, остаток в депозит.
  // Оператор может переопределить число дней/недель через extInputOverride.
  // v0.4.85: hoverDays — preview когда оператор водит мышью по календарю.
  // v0.6.3: новый floating-календарь read-only, hover не нужен — но
  // переменная участвует в формулах displayDays. Оставляем как null.
  const hoverDays: number | null = null;
  const extEnabled = overpay > 0 && overpayDest === "extend";
  const extAutoUnits = extEnabled
    ? Math.floor(overpay / Math.max(1, extIsWeekly ? extRate : extDailyRate))
    : 0;
  const extInputBase = extInputOverride ?? Math.max(1, extAutoUnits);
  // v0.4.90: extDays/extSum — СТАБИЛЬНЫЕ значения без hover (для submit
  // и distribute()). displayDays/displaySum — preview значения для UI
  // подсветки при наведении мыши на календарь.
  // Раньше extDays зависел от hoverDays — submit мог уйти на чужое
  // число дней (если оператор нажал «Принять» удерживая курсор на дне).
  // Баг #66: extend на «7 дн» создал placeholder 500 ₽ (1 день).
  const extDays = extIsWeekly ? extInputBase * 7 : extInputBase;
  const extWeeks = extIsWeekly ? extInputBase : 0;
  const extInput = extInputBase;
  const extEffectivePeriod = extIsWeekly
    ? ("week" as const)
    : periodForDays(extDays);
  const extSum = extIsWeekly ? extRate * extWeeks : extDailyRate * extDays;
  // v0.6.3: hover-preview больше не нужен (read-only calendar).
  void hoverDays;

  // v0.4.93: если переплата слишком мала для продления — авто-переключение
  // на «депозит». Иначе пользователь видит «продление невозможно» при
  // выборе extend по дефолту, что сбивает.
  // v0.6.3: в amount-mode НЕ переключаем — оператор сам контролирует
  // сумму, нулевые дни — нормальная промежуточная ситуация при наборе.
  useEffect(() => {
    if (mode === "amount") return;
    if (overpay > 0 && overpayDest === "extend" && extAutoUnits === 0) {
      setOverpayDest("deposit");
    }
  }, [overpay, overpayDest, extAutoUnits, mode]);

  // v0.6.3: amount-mode → days. Оператор вводит сумму, которую даёт
  // клиент, мы считаем сколько дней продления это даёт сверх долга.
  //   amount = клиент платит
  //   debtPortion = долг (если clearDebt) или 0 (если forgiveDebt)
  //   possibleUnits = floor( (amount - debtPortion) / rate )
  // Записываем в acceptedStr (для distribute) и extInputOverride
  // (для рендера/submit продления).
  useEffect(() => {
    if (mode !== "amount") return;
    const amt = Math.max(0, parseInt(amountInput || "0", 10));
    setAcceptedStr(amt > 0 ? String(amt) : "");
    const debtPortion = forgiveDebt ? 0 : dueAmount;
    const available = Math.max(0, amt - debtPortion);
    const unitRate = Math.max(1, extIsWeekly ? extRate : extDailyRate);
    const possibleUnits = Math.floor(available / unitRate);
    setExtInputOverride(possibleUnits > 0 ? possibleUnits : 1);
    if (possibleUnits > 0 && overpayDest !== "extend") {
      setOverpayDest("extend");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    amountInput,
    mode,
    forgiveDebt,
    dueAmount,
    extIsWeekly,
    extRate,
    extDailyRate,
  ]);
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
          // v0.5.9: если оператор выбрал «В залог аренды», часть денег
          // направляем в rental.deposit через /security-topup. Только
          // shortage = depositOriginal − deposit. Сверх — в депозит
          // клиента (clients.deposit_balance) как раньше.
          if (overpayDest === "security") {
            const original =
              (rental as { depositOriginal?: number }).depositOriginal ?? 0;
            const current = rental.deposit ?? 0;
            const shortage = Math.max(0, original - current);
            const toSecurity = Math.min(op.amount, shortage);
            const toClient = op.amount - toSecurity;
            if (toSecurity > 0) {
              await api.post(
                `/api/rentals/${rental.id}/security-topup`,
                { amount: toSecurity, method: op.method },
              );
            }
            if (toClient > 0) {
              await api.post(
                `/api/clients/${rental.clientId}/deposit/charge`,
                {
                  amount: toClient,
                  comment: `Переплата по аренде #${rental.id} (сверх пополнения залога)`,
                  rentalId: rental.id,
                },
              );
            }
          } else {
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

  // v0.6.2: вычисляем суммарный долг и просрочку для шапки drawer'а
  const isOverdueState = (overdueDaysBalanceRaw + overdueFineBalanceRaw) > 0;
  const overdueDaysHeader = debt?.overdueDays ?? 0;

  // v0.6.3: парсим даты аренды один раз для floating calendar и
  // вычисления newEnd (новой даты возврата) в Step 2.
  const parsedDates = useMemo(() => {
    const sm = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(rental.start);
    const em = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(rental.endPlanned);
    if (!sm || !em) return null;
    const startDate = new Date(
      Number(sm[3]),
      Number(sm[2]) - 1,
      Number(sm[1]),
    );
    const anchor = new Date(
      Number(em[3]),
      Number(em[2]) - 1,
      Number(em[1]),
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const extBase = anchor.getTime() < today.getTime() ? today : anchor;
    return { startDate, anchor, extBase, today };
  }, [rental.start, rental.endPlanned]);

  const newEnd = useMemo(() => {
    if (!parsedDates) return null;
    if (extDays <= 0) return parsedDates.anchor;
    const d = new Date(parsedDates.extBase);
    d.setDate(d.getDate() + extDays);
    return d;
  }, [parsedDates, extDays]);

  const fmtDDMMYYYY = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;

  // v0.6.3: экипировка inline (только показ + редактирование через
  // существующий EquipmentChangeDialog). Сама структура хранится в
  // rental.equipmentJson, никаких локальных копий тут не делаем —
  // диалог обновляет аренду через invalidateQueries.
  const equipment = rental.equipmentJson ?? [];
  const equipDaily = equipment.reduce(
    (s, e) => s + (e.free ? 0 : e.price),
    0,
  );
  const [equipDialogOpen, setEquipDialogOpen] = useState(false);

  // v0.6.5: «жёлтая зона» в floating-календаре + предупреждение «не хватает».
  // Считаем только в режиме «по сумме клиента» — там оператор сам вводит
  // amount, и легко получить недопокрытие. Когда mode='days' — оператор
  // явно выбрал N дней, формула «не хватает» теряет смысл.
  // Логика (по ТЗ):
  //   amount      = ввод клиента (acceptedStr)
  //   debtPortion = долг (если clearDebt) или 0 (если forgiveDebt)
  //   dailyTotal  = ставка аренды / сут + экипировка / сут (текущая)
  //   coveredDays = floor( max(0, amount - debtPortion) / dailyTotal )
  //   uncoveredDays = max(0, extDays - coveredDays)
  //   shortage    = max(0, extDays * dailyTotal + debtPortion - amount)
  const dailyExtTotal = extDailyRate + equipDaily;
  const debtPortionForShortage = forgiveDebt ? 0 : dueAmount;
  const amountForShortage = accepted;
  const coveredDaysShortage =
    mode === "amount"
      ? Math.floor(
          Math.max(0, amountForShortage - debtPortionForShortage) /
            Math.max(1, dailyExtTotal),
        )
      : extDays;
  const uncoveredDaysShortage =
    mode === "amount" ? Math.max(0, extDays - coveredDaysShortage) : 0;
  const shortageAmount =
    mode === "amount" && uncoveredDaysShortage > 0
      ? Math.max(
          0,
          extDays * dailyExtTotal + debtPortionForShortage - amountForShortage,
        )
      : 0;
  return (
    <div
      className={cn(
        "fixed inset-0 z-[120] flex items-end justify-center bg-ink/55 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
    >
      <div
        className={cn(
          // v0.6.2: bottom-drawer вместо центрированной модалки —
          // согласно design/claude-design/Hulk Bike CRM/extension-drawer.jsx.
          // Прижат к низу экрана, slide-up появление, max-h:88vh.
          "flex w-full max-w-[1200px] mb-3 mx-3 flex-col overflow-hidden rounded-2xl bg-surface border border-border shadow-card-lg",
          closing ? "animate-slide-down-out" : "animate-slide-up",
        )}
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: "88vh" }}
      >
        <div className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-blue-50 to-surface px-5 py-3">
          <div className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
            <Repeat size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-ink">
              {isOverdueState
                ? `Закрыть просрочку и продлить · #${String(rental.id).padStart(4, "0")}`
                : `Продление аренды · #${String(rental.id).padStart(4, "0")}`}
            </div>
            <div className="text-[11.5px] text-muted">
              {isOverdueState ? (
                <>
                  Просрочка{" "}
                  <span className="font-semibold text-red-ink tabular-nums">
                    {fmt(overdueDaysBalanceRaw + overdueFineBalanceRaw)} ₽
                    {overdueDaysHeader > 0 ? ` · ${overdueDaysHeader} дн` : ""}
                  </span>
                  {" "}— сначала закрытие долга, затем продление.
                </>
              ) : (
                <>Принять оплату по аренде и/или продлить.</>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin text-[13px] text-ink-2">
          {/* ─── STEP 1 (если есть просрочка) ─────────────────────────── */}
          {isOverdueState && (
            <div
              className="border-b border-border px-5 py-4"
              style={{ background: "hsl(var(--red-soft) / 0.3)" }}
            >
              <div className="mb-2.5 flex items-center gap-2">
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: "hsl(var(--red))" }}
                >
                  1
                </span>
                <div
                  className="text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: "hsl(var(--red-ink))" }}
                >
                  Сначала — просрочка
                </div>
                <span
                  className="ml-auto font-display text-[18px] font-extrabold tabular-nums"
                  style={{ color: "hsl(var(--red-ink))" }}
                >
                  {fmt(overdueBalanceRaw)} ₽
                  {overdueDaysHeader > 0 ? ` · ${overdueDaysHeader} дн` : ""}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={setClearDebt}
                  className={cn(
                    "rounded-[10px] border-2 bg-white px-3 py-2 text-left transition-colors",
                    clearDebt && !forgiveDebt
                      ? "border-blue-600"
                      : "border-transparent bg-white/60 hover:bg-white",
                  )}
                >
                  <div className="text-[12px] font-bold text-ink">
                    Погасить долг
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-muted">
                    включить {fmt(overdueBalanceRaw)} ₽ в эту оплату
                  </div>
                </button>
                <button
                  type="button"
                  onClick={setForgiveDebt}
                  className={cn(
                    "rounded-[10px] border-2 bg-white px-3 py-2 text-left transition-colors",
                    forgiveDebt
                      ? "border-emerald-500"
                      : "border-transparent bg-white/60 hover:bg-white",
                  )}
                >
                  <div className="text-[12px] font-bold text-green-ink">
                    Простить просрочку
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-muted">
                    −{fmt(overdueBalanceRaw)} ₽ списать на компанию
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* ─── STEP 2: период продления ─────────────────────────────── */}
          <div className="border-b border-border px-5 py-4">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                {isOverdueState ? "2" : "1"}
              </span>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                Период продления
              </div>
              <div className="ml-auto inline-flex rounded-full border border-border bg-surface-soft p-0.5">
                <button
                  type="button"
                  onClick={() => setMode("days")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors",
                    mode === "days"
                      ? "bg-white text-ink shadow-card-sm"
                      : "text-muted hover:text-ink-2",
                  )}
                >
                  <CalendarIcon size={11} /> по дням
                </button>
                <button
                  type="button"
                  onClick={() => setMode("amount")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors",
                    mode === "amount"
                      ? "bg-white text-ink shadow-card-sm"
                      : "text-muted hover:text-ink-2",
                  )}
                >
                  <Coins size={11} /> по сумме клиента
                </button>
              </div>
            </div>

            {mode === "days" ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-stretch overflow-hidden rounded-[12px] border border-border">
                  <button
                    type="button"
                    onClick={() => {
                      setOverpayDest("extend");
                      const cur = extInputOverride ?? extInputBase;
                      setExtInputOverride(Math.max(1, cur - 1));
                    }}
                    className="flex w-10 items-center justify-center bg-surface-soft text-[18px] text-muted hover:text-ink"
                  >
                    −
                  </button>
                  <div className="bg-white px-5 py-2 text-center">
                    <div className="font-display text-[26px] font-extrabold leading-none tabular-nums text-ink">
                      {extIsWeekly ? extDays : extInput}
                    </div>
                    <div className="text-[10px] text-muted">
                      {(extIsWeekly ? extDays : extInput) === 1
                        ? "день"
                        : (extIsWeekly ? extDays : extInput) < 5
                          ? "дня"
                          : "дней"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOverpayDest("extend");
                      setExtInputOverride((extInputOverride ?? extInputBase) + 1);
                    }}
                    className="flex w-10 items-center justify-center bg-surface-soft text-[18px] text-muted hover:text-ink"
                  >
                    +
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[3, 7, 14, 30].map((n) => {
                    const active = extDays === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          setOverpayDest("extend");
                          setExtInputOverride(
                            extIsWeekly ? Math.max(1, Math.round(n / 7)) : n,
                          );
                        }}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                          active
                            ? "border-blue-100 bg-blue-50 text-blue-700"
                            : "border-border text-muted hover:bg-surface-soft hover:text-ink-2",
                        )}
                      >
                        {n}д
                      </button>
                    );
                  })}
                </div>
                <div className="ml-auto text-right">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
                    Новый возврат
                  </div>
                  <div className="font-display text-[18px] font-extrabold tabular-nums text-blue-700">
                    {newEnd && extDays > 0 ? fmtDDMMYYYY(newEnd) : "—"}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-stretch overflow-hidden rounded-[12px] border border-border">
                  <input
                    value={amountInput}
                    onChange={(e) =>
                      setAmountInput(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    autoFocus
                    placeholder="2000"
                    className="w-[140px] bg-white px-4 py-2 font-display text-[24px] font-extrabold tabular-nums text-ink outline-none placeholder:text-muted-2"
                  />
                  <span className="flex items-center bg-surface-soft px-3 text-[14px] font-bold text-muted">
                    ₽
                  </span>
                </label>
                <div className="max-w-[220px] text-[11.5px] text-muted">
                  введите сумму, которую <b className="text-ink-2">даёт клиент</b> — посчитаем до какой даты можем продлить
                </div>
                <div className="ml-auto text-right">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
                    Хватит до
                  </div>
                  <div className="font-display text-[20px] font-extrabold tabular-nums text-blue-700">
                    {newEnd && extDays > 0 ? fmtDDMMYYYY(newEnd) : "—"}
                  </div>
                  <div className="text-[10.5px] text-muted-2">
                    {extDays > 0
                      ? `${extDays} ${extDays === 1 ? "день" : "дн"}`
                      : "недостаточно"}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ─── STEP 3: экипировка на новый период ─────────────────────
              v0.6.5: чипы кликабельны — открывают EquipmentChangeDialog
              для свапа (replaceAt) и добавления. По дизайну в правом
              верхнем углу — итог +N ₽/сут, и pill «+ Добавить». */}
          <div className="border-b border-border px-5 py-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                {isOverdueState ? "3" : "2"}
              </span>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                Экипировка на новый период
              </div>
              <span className="ml-auto text-[11px] text-muted">
                {equipDaily > 0 ? `+${equipDaily} ₽/сут` : "бесплатно"}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 rounded-[12px] border border-border bg-white p-2 min-h-[60px]">
              {equipment.length === 0 && (
                <div className="px-2 py-2 text-[11.5px] text-muted-2">
                  Без экипировки
                </div>
              )}
              {equipment.map((it, idx) => (
                <button
                  key={`${it.itemId ?? "noid"}-${idx}`}
                  type="button"
                  onClick={() => setEquipDialogOpen(true)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-1.5 py-1 text-[11.5px] font-semibold border border-transparent transition-colors hover:ring-2 hover:ring-blue-100",
                    it.free
                      ? "text-green-ink"
                      : "text-orange-ink",
                  )}
                  style={{
                    background: it.free
                      ? "hsl(var(--green-soft))"
                      : "hsl(var(--orange-soft))",
                  }}
                  title="Поменять / убрать"
                >
                  <Shirt size={11} />
                  {it.name}
                  {!it.free && (
                    <span className="tabular-nums">·{it.price}₽</span>
                  )}
                  <span className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/70">
                    <Repeat size={9} />
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setEquipDialogOpen(true)}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-blue-700 border border-dashed border-blue-100 hover:bg-blue-50"
              >
                <Pencil size={10} /> Изменить
              </button>
            </div>
          </div>

          {/* ─── STEP: депозит клиента ────────────────────────────────── */}
          {depositBalance > 0 && (
            <div className="border-b border-border px-5 py-4">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={useDeposit}
                  onChange={(e) => setUseDeposit(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-emerald-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold text-ink">
                    Использовать депозит клиента ·{" "}
                    <span className="tabular-nums text-green-ink">
                      {fmt(depositBalance)} ₽
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {useDeposit
                      ? `Зачтём ${fmt(depositToUse)} ₽ из депозита`
                      : "Депозит не трогаем — клиент платит сейчас"}
                  </div>
                </div>
              </label>
              {useDeposit && (
                <div className="mt-2 flex items-center gap-2 pl-7">
                  <span className="text-[11px] text-muted">Сумма:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={useDepositAmountStr}
                    onChange={(e) =>
                      setUseDepositAmountStr(
                        e.target.value.replace(/\D/g, ""),
                      )
                    }
                    placeholder={`всё (${fmt(depositBalance)})`}
                    className="h-7 w-32 rounded-[6px] border border-border bg-white px-2 text-[12px] tabular-nums outline-none focus:border-emerald-500"
                  />
                  <span className="text-[11px] text-muted">₽</span>
                </div>
              )}
            </div>
          )}

          {/* ─── STEP: списать с залога аренды ────────────────────────── */}
          {securityAllowed && (
            <div className="border-b border-border px-5 py-4">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={useSecurity}
                  onChange={(e) => setUseSecurity(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-amber-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                    <Shield size={12} className="text-amber-700" />
                    Списать с залога · max{" "}
                    <span className="tabular-nums">
                      {fmt(Math.min(securityMax, securityCoverable))} ₽
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    Только в счёт ущерба и просрочки. Аренду из залога
                    оплатить нельзя.
                  </div>
                </div>
              </label>
              {useSecurity && (
                <div className="mt-2 pl-7">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={Math.min(securityMax, securityCoverable)}
                      step={100}
                      value={Math.min(
                        Number(securityStr.replace(/\D/g, "")) || 0,
                        Math.min(securityMax, securityCoverable),
                      )}
                      onChange={(e) => setSecurityStr(e.target.value)}
                      className="flex-1 accent-amber-600"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={securityStr}
                      onChange={(e) =>
                        setSecurityStr(e.target.value.replace(/[^\d]/g, ""))
                      }
                      className="h-8 w-24 rounded-[8px] border border-border bg-white px-2 text-right text-[13px] tabular-nums outline-none focus:border-amber-600"
                    />
                    <span className="text-[11px] text-muted">₽</span>
                    <button
                      type="button"
                      onClick={() =>
                        setSecurityStr(
                          String(Math.min(securityMax, securityCoverable)),
                        )
                      }
                      className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-200"
                    >
                      max
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
                    <span>Останется в залоге:</span>
                    <span className="tabular-nums font-semibold text-ink-2">
                      {fmt(Math.max(0, securityMax - securityToUse))} ₽
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── STEP: Принято от клиента + способ ────────────────────── */}
          {mode === "days" && (
            <div className="border-b border-border px-5 py-4">
              <div className="mb-1.5 flex items-center gap-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                  Принято от клиента, ₽
                </div>
                <div className="ml-auto inline-flex rounded-full border border-border bg-white p-0.5">
                  {METHODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m.id)}
                      className={cn(
                        "rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors",
                        method === m.id
                          ? "bg-blue-600 text-white"
                          : "text-muted hover:text-ink-2",
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                inputMode="numeric"
                value={acceptedStr}
                onChange={(e) =>
                  setAcceptedStr(e.target.value.replace(/[^\d]/g, ""))
                }
                onFocus={(e) => e.currentTarget.select()}
                placeholder="0"
                className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[16px] font-semibold tabular-nums text-ink outline-none focus:border-blue-600"
              />
            </div>
          )}
          {mode === "amount" && (
            <div className="border-b border-border px-5 py-4">
              <div className="mb-1.5 flex items-center gap-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                  Способ оплаты
                </div>
                <div className="ml-auto inline-flex rounded-full border border-border bg-white p-0.5">
                  {METHODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m.id)}
                      className={cn(
                        "rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors",
                        method === m.id
                          ? "bg-blue-600 text-white"
                          : "text-muted hover:text-ink-2",
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-[11px] text-muted">
                Принято от клиента:{" "}
                <span className="font-semibold text-ink-2 tabular-nums">
                  {fmt(accepted)} ₽
                </span>
              </div>
            </div>
          )}

          {/* ─── Куда направить переплату ─────────────────────────────── */}
          {overpay > 0 && (
            <div className="border-b border-border px-5 py-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                  Переплата · {fmt(overpay)} ₽ — куда направить?
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(() => {
                  const opts: Array<{
                    id: OverpayDest;
                    label: string;
                    icon: typeof Wallet;
                  }> = [];
                  if (needsSecurityTopup) {
                    opts.push({
                      id: "security",
                      label: "В залог аренды",
                      icon: Shield,
                    });
                  }
                  opts.push({
                    id: "deposit",
                    label: "В депозит клиента",
                    icon: Wallet,
                  });
                  opts.push({
                    id: "extend",
                    label: "В продление",
                    icon: Repeat,
                  });
                  return opts;
                })().map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setOverpayDest(opt.id);
                      if (opt.id !== "extend") setExtInputOverride(null);
                    }}
                    className={cn(
                      "inline-flex flex-1 items-center justify-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-[12px] font-semibold transition-colors",
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
              {overpayDest === "extend" && extEnabled && extResidualToDeposit > 0 && (
                <div className="mt-1.5 text-[10.5px] text-muted">
                  Остаток {fmt(extResidualToDeposit)} ₽ (меньше одного дня
                  тарифа) уйдёт в депозит клиента.
                </div>
              )}
              {overpayDest === "extend" && extEnabled && extSum > overpay && (
                <div className="mt-1.5 text-[10.5px] font-semibold text-amber-700">
                  ⚠ Выбрано больше дней, чем покрывает переплата —
                  не хватает {fmt(extSum - overpay)} ₽.
                </div>
              )}
            </div>
          )}

          {/* v0.6.5: предупреждение «не хватает» — над финальной карточкой
              только в режиме «по сумме клиента». */}
          {shortageAmount > 0 && (
            <div className="px-5 pt-4">
              <div
                className="rounded-[10px] px-3 py-2 text-[11.5px] font-semibold"
                style={{
                  background: "hsl(var(--red-soft))",
                  color: "hsl(var(--red-ink))",
                }}
              >
                Не хватает {fmt(shortageAmount)} ₽ для {uncoveredDaysShortage}
                {" "}
                {uncoveredDaysShortage === 1
                  ? "дня"
                  : uncoveredDaysShortage < 5
                    ? "дней"
                    : "дней"}{" "}
                продления — оператор может оставить меньше дней или
                клиент доплатит позже.
              </div>
            </div>
          )}

          {/* ─── Финальная карточка «Будет проведено» (детализация) ─── */}
          <div className="px-5 py-4">
            <div className="rounded-[12px] border border-border bg-surface-soft px-4 py-3">
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
                Будет проведено
              </div>
              <div className="flex flex-col gap-0.5 text-[12px]">
                {accepted > 0 && (
                  <Row
                    label={`Принято (${METHODS.find((m) => m.id === method)?.label})`}
                    value={`+ ${fmt(accepted)} ₽`}
                  />
                )}
                {depositToUse > 0 && (
                  <Row
                    label="Из депозита клиента"
                    value={`− ${fmt(depositToUse)} ₽`}
                  />
                )}
                {securityToUse > 0 && (
                  <Row
                    label="Списано с залога"
                    value={`− ${fmt(securityToUse)} ₽`}
                  />
                )}
                {forgiveDebt && overdueBalanceRaw > 0 && (
                  <Row
                    label="Просрочка прощена"
                    value={`−${fmt(overdueBalanceRaw)} ₽`}
                  />
                )}
                <div className="mt-1 flex justify-between border-t border-border pt-1 text-ink">
                  <span className="font-semibold">Зачтено в долг/аренду</span>
                  <span className="tabular-nums font-semibold">
                    {fmt(Math.min(dueAmount, totalReceived))} ₽
                  </span>
                </div>
                {overpay > 0 && extEnabled && extSum > 0 && (
                  <>
                    <div className="flex justify-between text-emerald-700">
                      <span>Продление аренды (+{extDays} дн)</span>
                      <span className="tabular-nums">+ {fmt(extSum)} ₽</span>
                    </div>
                    {extResidualToDeposit > 0 && (
                      <div className="flex justify-between text-green-700">
                        <span>Остаток → депозит клиента</span>
                        <span className="tabular-nums">
                          + {fmt(extResidualToDeposit)} ₽
                        </span>
                      </div>
                    )}
                  </>
                )}
                {overpay > 0 && overpayDest === "security" && (
                  <div className="flex justify-between text-blue-700">
                    <span>Залог пополнен</span>
                    <span className="tabular-nums">+ {fmt(overpay)} ₽</span>
                  </div>
                )}
                {overpay > 0 && overpayDest === "deposit" && (
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
        </div>

        {/* ─── FOOTER v0.6.5 ─── 2 колонки: краткая раскладка + К ПРИЁМУ ─── */}
        <div className="rounded-b-2xl border-t border-border bg-surface-soft px-5 py-3">
          <div className="grid grid-cols-12 items-end gap-4">
            <div className="col-span-7 flex flex-col gap-1 text-[11.5px]">
              {(() => {
                const debtPortionFooter = forgiveDebt ? 0 : dueAmount;
                return (
                  <>
                    {debtPortionFooter > 0 && (
                      <FooterRow
                        label={`Закрытие просрочки${overdueDaysHeader > 0 ? ` · ${overdueDaysHeader} дн` : ""}`}
                        value={`${fmt(debtPortionFooter)} ₽`}
                        tone="red"
                      />
                    )}
                    {forgiveDebt && overdueBalanceRaw > 0 && (
                      <FooterRow
                        label="Просрочка прощена"
                        value={`−${fmt(overdueBalanceRaw)} ₽`}
                        tone="green"
                      />
                    )}
                    {extDays > 0 && (
                      <FooterRow
                        label={`Аренда ${extDays} × ${extDailyRate} ₽`}
                        value={`${fmt(extDailyRate * extDays)} ₽`}
                      />
                    )}
                    {extDays > 0 && equipDaily > 0 && (
                      <FooterRow
                        label={`Экипировка ${extDays} × ${equipDaily} ₽`}
                        value={`${fmt(equipDaily * extDays)} ₽`}
                      />
                    )}
                    {depositToUse > 0 && (
                      <FooterRow
                        label="Списано с депозита"
                        value={`−${fmt(depositToUse)} ₽`}
                        tone="green"
                      />
                    )}
                  </>
                );
              })()}
              {depositBalance > 0 && (
                <label className="mt-1 flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={useDeposit}
                    onChange={(e) => setUseDeposit(e.target.checked)}
                    disabled={depositBalance === 0}
                    className="h-3.5 w-3.5 accent-blue-600"
                  />
                  <span className="text-[11.5px] text-ink-2">
                    Списать с депозита ({fmt(depositBalance)} ₽)
                  </span>
                </label>
              )}
            </div>
            <div className="col-span-5 text-right">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
                К приёму
              </div>
              <div className="font-display text-[28px] font-extrabold leading-none tabular-nums text-blue-700 mt-0.5">
                {fmt(Math.max(0, accepted))} ₽
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                <div className="flex rounded-full border border-border bg-white p-0.5">
                  {METHODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m.id)}
                      className={cn(
                        "rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors",
                        method === m.id
                          ? "bg-blue-600 text-white"
                          : "text-muted hover:text-ink-2",
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={requestClose}
                  className="rounded-full px-3 py-2 text-[12.5px] font-semibold text-muted hover:text-ink-2"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={
                    saving ||
                    (totalReceived <= 0 && !forgiveDebt)
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-bold text-white",
                    saving || (totalReceived <= 0 && !forgiveDebt)
                      ? "cursor-not-allowed bg-surface text-muted-2"
                      : "bg-blue-600 hover:bg-blue-700",
                  )}
                >
                  <Check size={14} />{" "}
                  {extDays > 0 && (forgiveDebt || dueAmount > 0)
                    ? "Принять и продлить"
                    : extDays > 0
                      ? "Принять и продлить"
                      : forgiveDebt
                        ? "Простить и закрыть"
                        : "Принять"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* v0.6.3: floating compact calendar — read-only превью периода
          (аренда + просрочка + продление). Зависает НАД drawer'ом. */}
      {parsedDates && newEnd && (
        <CompactExtendCalendar
          startDate={parsedDates.startDate}
          anchor={parsedDates.anchor}
          today={parsedDates.today}
          newEnd={newEnd}
          hasOverdue={isOverdueState}
          forgiveDebt={forgiveDebt}
          coveredDays={coveredDaysShortage}
          extDays={extDays}
        />
      )}

      {/* v0.6.3: редактор экипировки открывается из Step 3 — отдельный
          диалог. После закрытия React Query инвалидирует rental,
          equipmentJson обновится автоматически. */}
      {equipDialogOpen && (
        <EquipmentChangeDialog
          rental={rental}
          onClose={() => setEquipDialogOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Compact floating calendar для PaymentAcceptDialog (v0.6.3).
 * Без drag — только показ периодов:
 *  · синие ячейки = аренда (start..anchor)
 *  · красные = просрочка (anchor..today) если просрочка
 *  · зелёные = продление (today..newEnd или anchor..newEnd)
 */
function CompactExtendCalendar({
  startDate,
  anchor,
  today,
  newEnd,
  hasOverdue,
  forgiveDebt,
  coveredDays,
  extDays,
}: {
  startDate: Date;
  anchor: Date;
  today: Date;
  newEnd: Date;
  hasOverdue: boolean;
  forgiveDebt: boolean;
  /** v0.6.5: сколько дней продления оплачены (для жёлтой зоны). */
  coveredDays: number;
  /** v0.6.5: всего дней продления (для определения uncovered). */
  extDays: number;
}) {
  const dayMs = 86_400_000;
  const stripTime = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const startMs = stripTime(startDate);
  const anchorMs = stripTime(anchor);
  const todayMs = stripTime(today);
  const endMs = stripTime(newEnd);
  const lastMs = Math.max(endMs, anchorMs, todayMs);
  const totalSpan = Math.max(
    10,
    Math.round((lastMs - startMs) / dayMs) + 2,
  );
  // ограничиваем чтобы не разрослось
  const maxCells = 21;
  const cells: Array<{ d: Date; ms: number }> = [];
  for (let i = 0; i < Math.min(totalSpan, maxCells); i++) {
    const d = new Date(startMs + i * dayMs);
    cells.push({ d, ms: stripTime(d) });
  }

  return (
    <div
      className="fixed inset-x-0 z-30 flex pointer-events-none justify-center"
      style={{ bottom: "calc(min(86vh, 540px) + 14px)" }}
    >
      <div className="pointer-events-auto rounded-[12px] border border-border bg-white shadow-card-lg overflow-hidden max-w-[760px]">
        <div className="flex items-center justify-between border-b border-border bg-surface-soft/50 px-3 py-1.5">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
            Период аренды
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded border border-blue-300 bg-blue-100" />
              аренда
            </span>
            {hasOverdue && !forgiveDebt && (
              <span className="inline-flex items-center gap-1">
                <span
                  className="h-2.5 w-2.5 rounded border"
                  style={{
                    borderColor: "hsl(var(--red))",
                    background: "hsl(var(--red-soft))",
                  }}
                />
                просрочка
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded border border-emerald-500 bg-emerald-100" />
              продление
            </span>
          </div>
        </div>
        <div className="p-2">
          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
            }}
          >
            {cells.map((c, i) => {
              const inRental = c.ms >= startMs && c.ms <= anchorMs;
              const inOverdue =
                hasOverdue && !forgiveDebt && c.ms > anchorMs && c.ms <= todayMs;
              const greenStart = hasOverdue ? todayMs : anchorMs;
              const inExtension = c.ms > greenStart && c.ms <= endMs;
              // v0.6.5: dayOffset считаем от первого дня продления.
              // Если день продления больше coveredDays — это «жёлтая зона».
              const dayOffset =
                inExtension
                  ? Math.round((c.ms - greenStart) / dayMs)
                  : 0;
              const uncoveredZone =
                inExtension &&
                extDays > 0 &&
                coveredDays < extDays &&
                dayOffset > coveredDays;
              const isNewEnd = c.ms === endMs && endMs > anchorMs;
              const wd = c.d.getDay();
              let bg = "transparent";
              let border = "hsl(var(--border))";
              let ink = "hsl(var(--muted-2))";
              if (inRental) {
                bg = "hsl(var(--blue-50))";
                border = "hsl(var(--blue-100))";
                ink = "hsl(var(--blue-700))";
              }
              if (inOverdue) {
                bg = "hsl(var(--red-soft))";
                border = "hsl(var(--red))";
                ink = "hsl(var(--red-ink))";
              }
              if (inExtension) {
                bg = "hsl(var(--green-soft))";
                border = "hsl(var(--green-ink))";
                ink = "hsl(var(--green-ink))";
              }
              if (uncoveredZone) {
                // Жёлтая «не хватает» зона — продление выбрано, но клиент
                // ввёл сумму меньше нужной.
                bg = "#fef3c7"; // amber-100
                border = "#d97706"; // amber-700
                ink = "#92400e"; // amber-900
              }
              return (
                <div
                  key={i}
                  className={cn(
                    "relative rounded-[7px] py-1 text-center",
                    isNewEnd && "ring-2 ring-emerald-500 ring-offset-1",
                  )}
                  style={{
                    background: bg,
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: border,
                    color: ink,
                  }}
                >
                  <div className="text-[8.5px] font-bold uppercase tracking-wider opacity-70">
                    {["вс", "пн", "вт", "ср", "чт", "пт", "сб"][wd]}
                  </div>
                  <div className="font-display text-[12px] font-extrabold tabular-nums leading-none">
                    {c.d.getDate()}
                  </div>
                </div>
              );
            })}
          </div>
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

/**
 * v0.6.5: строка футера в 2-колоночном layout — слева подпись, справа
 * сумма. Tones: 'red'/'green' для просрочки/прощения, undefined — нейтр.
 */
function FooterRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "red" | "green";
}) {
  const labelClass =
    tone === "red"
      ? "text-red-ink"
      : tone === "green"
        ? "text-green-ink"
        : "text-muted";
  const valueClass =
    tone === "red"
      ? "text-red-ink"
      : tone === "green"
        ? "text-green-ink"
        : "text-ink-2";
  return (
    <div className="flex items-center justify-between">
      <span className={labelClass}>{label}</span>
      <span className={cn("tabular-nums font-semibold", valueClass)}>{value}</span>
    </div>
  );
}
