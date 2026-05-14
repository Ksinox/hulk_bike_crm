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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  X,
  Repeat,
  Coins,
  Calendar as CalendarIcon,
  Shirt,
  Pencil,
  ChevronRight,
  Wallet,
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
  TARIFF,
  TARIFF_PERIOD_LABEL,
  type TariffPeriod,
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
  onExtDaysChange,
  liftedFromRect,
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
  /**
   * v0.6.24: callback наверх при изменении extDays через input/
   * spinner/quick-pills/amount. Используется RentalCard'ом для
   * пересинхронизации календаря в карточке (баг v0.6.23: input
   * менялся, календарь не реагировал).
   */
  onExtDaysChange?: (days: number) => void;
  /**
   * v0.6.13: исходная позиция оригинального CalendarPanel в карточке
   * аренды. Используется для FLIP-анимации: floating-копия календаря
   * стартует с translate( fromRect - finalRect ) и плавно переходит
   * в финальную позицию над bottom-drawer'ом. На закрытии — обратный
   * FLIP. Если не передан — анимация отключается (fallback fade).
   */
  liftedFromRect?: {
    top: number;
    left: number;
    width: number;
    height: number;
  } | null;
}) {
  // v0.6.16: liftedFromRect больше не используется (floating-календарь
  // убран). Оставлен в API ради backwards-compat — RentalCard всё ещё
  // передаёт, но мы игнорируем.
  void liftedFromRect;
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

  // v0.6.11: одно состояние выбора действия по просрочке (Step 1).
  //   'clear'    — погасить долг (без forgive)
  //   'days-all' — простить ВСЕ неоплаченные дни (target='days' с daysCount=overdueDays;
  //                бэкенд авто-снимет fine за эти дни + сдвинет endPlanned на overdueDays)
  //   'days-n'   — простить только N дней (target='days', daysCount=N)
  //   'fine'     — простить только штраф (target='fine')
  //   'fine-n'   — простить штраф только за N дней (v0.6.13)
  //   'all'      — простить ВСЁ (target='all')
  // Дни/штраф учёт для расчёта «к приёму» производный (см. ниже).
  type ForgiveChoice =
    | "clear"
    | "days-all"
    | "days-n"
    | "fine"
    | "fine-n"
    | "all";
  const hasOverdueFine = overdueFineBalanceRaw > 0;
  const hasOverdueDays = overdueDaysBalanceRaw > 0;
  const hasOverdue = hasOverdueFine || hasOverdueDays;
  const overdueBalanceRaw = overdueDaysBalanceRaw + overdueFineBalanceRaw;
  const overdueDaysCount = debt?.overdueDays ?? 0;
  const dailyRateBase = rental.rateUnit === "week"
    ? Math.max(1, Math.round(rental.rate / 7))
    : Math.max(1, rental.rate);
  const fineDailyRate = Math.round(dailyRateBase * 0.5);
  const [forgiveChoice, setForgiveChoice] = useState<ForgiveChoice>("clear");
  // Количество дней для частичного прощения (forgiveChoice='days-n').
  // Ограничено [1, overdueDaysCount] — больше прощать нельзя.
  const [forgiveDaysN, setForgiveDaysN] = useState<number>(1);
  // v0.6.13: для 'fine-n' — N дней штрафа, тоже [1, overdueDaysCount].
  const [forgiveFineN, setForgiveFineN] = useState<number>(1);
  useEffect(() => {
    // При смене аренды сбрасываем выбор + ограничиваем N.
    if (forgiveDaysN > Math.max(1, overdueDaysCount)) {
      setForgiveDaysN(Math.max(1, overdueDaysCount));
    }
    if (forgiveFineN > Math.max(1, overdueDaysCount)) {
      setForgiveFineN(Math.max(1, overdueDaysCount));
    }
  }, [overdueDaysCount, forgiveDaysN, forgiveFineN]);

  // Эффективный остаток дней/штрафа просрочки после применения выбора.
  // 'days-n'  — линейное уменьшение на N×dailyRate (плюс fine за эти N дней).
  // 'days-all'— все дни и весь fine за них прощены целиком.
  // 'fine'    — только fine.
  // 'fine-n'  — fine только за N дней (N × fineDailyRate, дни остаются).
  // 'all'     — оба = 0.
  const partialDaysAmount =
    forgiveChoice === "days-n"
      ? Math.min(overdueDaysBalanceRaw, forgiveDaysN * dailyRateBase)
      : 0;
  const partialFineAmount =
    forgiveChoice === "days-n"
      ? Math.min(overdueFineBalanceRaw, forgiveDaysN * fineDailyRate)
      : forgiveChoice === "fine-n"
        ? Math.min(overdueFineBalanceRaw, forgiveFineN * fineDailyRate)
        : 0;
  const overdueDaysBalance =
    forgiveChoice === "all" || forgiveChoice === "days-all"
      ? 0
      : Math.max(0, overdueDaysBalanceRaw - partialDaysAmount);
  const overdueFineBalance =
    forgiveChoice === "all" || forgiveChoice === "fine"
      ? 0
      : forgiveChoice === "days-all"
        ? 0
        : Math.max(0, overdueFineBalanceRaw - partialFineAmount);

  // Сдвиг endPlanned за счёт прощения/оплаты дней — в днях:
  //   'clear'    — оператор ПЛАТИТ за дни (kind=overdue_days_payment),
  //                бэкенд сдвигает endPlanned на overdueDaysCount.
  //   'days-all' — все дни просрочки (overdueDaysCount)
  //   'days-n'   — N (но не больше overdueDaysCount)
  //   'fine'     — НЕ сдвигаем (дни остаются в долге)
  //   'all'      — все дни (бэкенд тоже сдвигает)
  // Используется во floating calendar (yellow → blue ячейки).
  // v0.6.16: forgiveShiftDays больше не используется (floating-календарь
  // убран; sidebar полагается на live drag в карточке). Оставлен ради
  // ясности логики, но помечен void чтобы TS не ругался на unused.
  const forgiveShiftDays =
    forgiveChoice === "days-all"
      ? overdueDaysCount
      : forgiveChoice === "days-n"
        ? Math.min(forgiveDaysN, overdueDaysCount)
        : forgiveChoice === "all"
          ? overdueDaysCount
          : forgiveChoice === "clear"
            ? overdueDaysCount
            : 0;
  void forgiveShiftDays;

  // Обратносовместимые алиасы для существующего UI/submit-кода.
  const forgiveDebt = forgiveChoice !== "clear";
  const setClearDebt = () => setForgiveChoice("clear");

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
  // v0.6.7: новый UX (extension-drawer.jsx) не предусматривает явного
  // выбора «куда направить переплату». Переплата всегда идёт в продление
  // (extend) — оператор управляет количеством дней через Step 2.
  // Остаток (< одного дня тарифа) автоматически уходит в депозит клиента
  // через distribute(). Стейт сохранён для submit-логики, но всегда
  // равен "extend" в новом UI.
  type OverpayDest = "deposit" | "extend" | "security";
  const [overpayDest, setOverpayDest] = useState<OverpayDest>("extend");

  // v0.6.13: тариф продления — selectedTariff. По умолчанию = текущий
  // тариф аренды (rental.tariffPeriod). Оператор может переключить на
  // другой пресет (short/day/week/month) из тарифной сетки модели или
  // включить custom-режим (своя ставка).
  //   - 'short' | 'day' | 'week' | 'month' → TARIFF[model][period]
  //   - 'custom' → extCustomRate с extCustomUnit ('day'|'week')
  // tariffPeriod в rental может быть 'day'/'short'/'week'/'month' — все
  // 4 показываем как pills.
  type TariffSel = TariffPeriod | "custom";
  const initialTariff: TariffSel = (rental.tariffPeriod ?? "day") as TariffSel;
  const [selectedTariff, setSelectedTariff] =
    useState<TariffSel>(initialTariff);
  // v0.6.14: tariffPinned — флаг, что оператор вручную выбрал тариф.
  // Тогда useEffect ниже НЕ перетирает selectedTariff при изменении extDays.
  // Сбрасывается только при выборе custom (через checkbox).
  const [tariffPinned, setTariffPinned] = useState<boolean>(false);
  const [extCustomRate, setExtCustomRate] = useState<number>(rental.rate);
  const [extCustomUnit, setExtCustomUnit] = useState<"day" | "week">(
    rental.rateUnit === "week" ? "week" : "day",
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

  // v0.6.16: card calendar = primary controller. Когда оператор тащит
  // ручку в карточке (слева, viewable), initialExtDays меняется. Мы это
  // ловим и пересинхронизируем extInputOverride/footer в side panel'е.
  useEffect(() => {
    if (initialExtDays == null || initialExtDays <= 0) return;
    const next =
      rental.rateUnit === "week"
        ? Math.max(1, Math.ceil(initialExtDays / 7))
        : initialExtDays;
    setExtInputOverride(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialExtDays]);
  // v0.6.13: тариф продления вычисляется из selectedTariff.
  //   - preset (short/day/week/month) → ставка из TARIFF, unit = 'day'
  //     (период недельного тарифа всё равно считается в днях по ставке/сут;
  //     только если оператор явно выбрал custom unit='week' — тогда week).
  //   - 'custom' → extCustomRate + extCustomUnit
  const extIsWeekly =
    selectedTariff === "custom" && extCustomUnit === "week";
  const extRate = (() => {
    if (selectedTariff === "custom") return Math.max(0, extCustomRate);
    return TARIFF[rental.model][selectedTariff];
  })();
  const extDailyRate = extIsWeekly ? Math.max(1, Math.round(extRate / 7)) : extRate;
  // v0.6.7: экипировка ВСЕГДА учитывается в формуле дней/суммы продления
  // (см. extension-drawer.jsx line 14-15: dailyTotal = rate + equipDaily).
  // Перенесли определение equipment/equipDaily сюда (выше acceptedStr),
  // чтобы синхронизация суммы работала корректно.
  const equipment = rental.equipmentJson ?? [];
  const equipDaily = equipment.reduce(
    (s, e) => s + (e.free ? 0 : e.price),
    0,
  );
  // Долги (без extend — он считается по переплате)
  const totalDebt =
    pendingRent +
    overdueDaysBalance +
    overdueFineBalance +
    damageBalance +
    manualBalance;
  const dueAmount = totalDebt;

  // Источники
  // v0.6.7: депозит управляется одним checkbox'ом в footer'е (как в
  // extension-drawer.jsx). При включении списываем ВЕСЬ доступный
  // депозит (или нужное количество — что меньше). Старый input
  // частичной суммы убран — управляется автоматически.
  const [useDeposit, setUseDeposit] = useState<boolean>(false);
  const depositToUse = useDeposit ? depositBalance : 0;
  const remainingAfterDeposit = Math.max(0, dueAmount - depositToUse);

  // v0.6.11: пополнение залога. Доступно когда:
  //  - залог денежный (depositItem === null/undefined)
  //  - rental.deposit < rental.depositOriginal (есть «недостача»)
  // По умолчанию сумма = shortage, оператор может править input.
  const rentalDepositCurrent = rental.deposit ?? 0;
  const rentalDepositOriginal =
    (rental as { depositOriginal?: number }).depositOriginal ?? rentalDepositCurrent;
  const securityShortage = Math.max(
    0,
    rentalDepositOriginal - rentalDepositCurrent,
  );
  const canTopupSecurity = !rental.depositItem && securityShortage > 0;
  const [topupSecurity, setTopupSecurity] = useState<boolean>(false);
  const [topupAmountStr, setTopupAmountStr] = useState<string>(() =>
    canTopupSecurity ? String(securityShortage) : "",
  );
  const topupAmount = topupSecurity
    ? Math.min(
        securityShortage,
        Math.max(0, parseInt(topupAmountStr.replace(/\D/g, "") || "0", 10)),
      )
    : 0;

  // v0.6.7: списание с залога аренды убрано из UI — функциональность
  // не входит в новый дизайн (extension-drawer.jsx). securityToUse=0
  // всегда. Если когда-то понадобится — добавить через отдельный flow,
  // не в основном диалоге приёма оплаты.
  const securityToUse = 0;
  const remainingAfterSecurity = remainingAfterDeposit;

  // v0.6.7: extInputBase — кол-во ЕДИНИЦ продления (дней или недель).
  //   mode='days'   → управляется через спиннер/quick-presets (extInputOverride).
  //   mode='amount' → вычисляется из amountInput (см. useEffect ниже).
  // В режиме days дефолт = 0 (оператор явно жмёт + или quick-pill),
  // если только не пришёл initialExtDays (drag-to-extend).
  const extInputBase = Math.max(0, extInputOverride ?? 0);
  const extDays = extIsWeekly ? extInputBase * 7 : extInputBase;
  const extWeeks = extIsWeekly ? extInputBase : 0;

  // v0.6.24: сообщаем наверх когда extDays меняется — родитель
  // (RentalCard) пересинхронизирует календарь в карточке. Защита от
  // петли: useEffect диалога обновляет extInputOverride только если
  // initialExtDays реально меняется; setState с тем же значением
  // React пропускает.
  useEffect(() => {
    onExtDaysChange?.(extDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extDays]);
  // v0.6.13: tariffPeriod для extend-inplace.
  //   - custom + week → 'week'
  //   - custom + day → periodForDays(extDays) (бэкенд enum принимает short/week/month)
  //   - preset → если 'day' — мапим в periodForDays (БД не знает 'day')
  //     иначе передаём как есть.
  const extEffectivePeriod: TariffPeriod = (() => {
    if (extIsWeekly) return "week";
    if (selectedTariff === "custom") return periodForDays(Math.max(1, extDays));
    if (selectedTariff === "day") return periodForDays(Math.max(1, extDays));
    return selectedTariff;
  })();
  // v0.6.14: авто-подбор тарифа по числу дней продления.
  //   1-2 дн   → 'day'    (label "1–2 дня")
  //   3-6 дн   → 'short'  (label "3–6 дней")
  //   7-29 дн  → 'week'   (label "7–29 дней")
  //   30+ дн   → 'month'  (label "30+ дней")
  // Если оператор уже выбрал тариф вручную (tariffPinned=true) или включил
  // 'custom' — не перетираем выбор. Иначе при каждом изменении extDays
  // подсветка переключается на соответствующий пресет.
  useEffect(() => {
    if (tariffPinned) return;
    if (selectedTariff === "custom") return;
    if (extDays <= 0) return;
    const auto: TariffPeriod =
      extDays <= 2
        ? "day"
        : extDays <= 6
          ? "short"
          : extDays <= 29
            ? "week"
            : "month";
    if (auto !== selectedTariff) {
      setSelectedTariff(auto);
    }
  }, [extDays, tariffPinned, selectedTariff]);
  // extSum считается «по аренде» (без экипировки) — для extend-inplace.
  const extSum = extIsWeekly ? extRate * extWeeks : extDailyRate * extDays;
  // v0.6.7: dailyTotal = аренда + экипировка/сут (как в дизайне line 15).
  const dailyExtTotalBase = extDailyRate + equipDaily;
  const equipSum = equipDaily * extDays;
  // Грубая сумма продления: аренда + экипировка за выбранные дни.
  const periodTotal = extSum + equipSum;
  // Долг к закрытию.
  // v0.6.12: dueAmount УЖЕ содержит post-forgive балансы overdueDays/Fine
  // (см. overdueDaysBalance/overdueFineBalance выше). А damage/manual/
  // pendingRent в forgive НЕ участвуют — их всё равно надо собрать.
  // Старый код `forgiveDebt ? 0 : dueAmount` зануливал и damage/manual,
  // что приводило к недосбору при любом частичном прощении.
  const debtPortion = dueAmount;
  // Общая сумма «всё что нужно собрать» (до учёта депозита).
  // v0.6.11: + пополнение залога (если оператор включил).
  const grossTotal = debtPortion + periodTotal + topupAmount;
  // v0.4.83: «Принято от клиента» — пустое поле когда сумма 0, чтоб
  // оператор не стирал нолик при наборе.
  const [acceptedStr, setAcceptedStr] = useState<string>(() => {
    if (!initialExtDays || initialExtDays <= 0) {
      return remainingAfterSecurity > 0 ? String(remainingAfterSecurity) : "";
    }
    return "";
  });
  // v0.6.7: в режиме days acceptedStr автоматически = grossTotal − depositToUse.
  // В режиме amount — управляется отдельно через amountInput.
  useEffect(() => {
    if (mode === "amount") return;
    const target = Math.max(0, grossTotal - depositToUse);
    setAcceptedStr(target > 0 ? String(target) : "");
  }, [grossTotal, depositToUse, mode]);

  const accepted = Number(acceptedStr.replace(/\D/g, "")) || 0;
  const totalReceived = depositToUse + securityToUse + accepted;
  // v0.6.11: вычитаем topup из подсчёта overpay/underpay — пополнение
  // залога это «своя» строка платежа, не относится к закрытию долга.
  const overpay = Math.max(0, totalReceived - dueAmount - topupAmount);
  const underpay = Math.max(0, dueAmount + topupAmount - totalReceived);

  // v0.6.7: extension всегда «включён» когда extDays > 0 — оператор
  // явно выбрал период (через спиннер/preset/amount). Старая логика
  // «extEnabled только при overpay > 0» убрана — она ломала случай
  // когда оператор использует депозит как источник продления.
  const extEnabled = extDays > 0;

  // v0.6.3: amount-mode → days. Оператор вводит сумму, которую даёт
  // клиент, мы считаем сколько дней продления это даёт сверх долга.
  //   amount = клиент платит
  //   debtPortion = долг (если clearDebt) или 0 (если forgiveDebt)
  //   possibleUnits = floor( (amount - debtPortion - equipPart) / dailyTotal )
  useEffect(() => {
    if (mode !== "amount") return;
    const amt = Math.max(0, parseInt(amountInput || "0", 10));
    setAcceptedStr(amt > 0 ? String(amt) : "");
    const available = Math.max(0, amt - debtPortion);
    // v0.6.7: dailyTotal включает экипировку.
    const unitDaily = Math.max(1, extIsWeekly ? extRate + equipDaily * 7 : dailyExtTotalBase);
    const possibleUnits = Math.floor(available / unitDaily);
    setExtInputOverride(possibleUnits > 0 ? possibleUnits : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    amountInput,
    mode,
    debtPortion,
    extIsWeekly,
    extRate,
    equipDaily,
    dailyExtTotalBase,
  ]);

  // v0.6.7: при переключении mode='days' — если override был 0
  // (после amount-вычисления), сразу поставим дефолт 1, чтобы спиннер
  // показал понятное значение. Это не активирует продление само по
  // себе — extEnabled true только когда оператор сознательно жмёт +.
  // Для drag-to-extend (initialExtDays > 0) override уже > 0.
  // НЕ автоматизируем, оставляем 0 для свежего открытия без overdue.

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
  const distribute = (acceptedAvail: number = accepted): Op[] => {
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
      { amount: acceptedAvail, method },
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
      // v0.6.11: новая модель Step 1 — единый forgiveChoice.
      //   'clear'    — ничего не прощаем (только погашаем).
      //   'days-all' — все неоплаченные дни (+ fine за эти дни авто).
      //   'days-n'   — ровно N дней (бэкенд cap'ит по реальному остатку).
      //   'fine'     — только штраф 50%.
      //   'all'      — всё (дни + штраф).
      if (hasOverdue && forgiveChoice !== "clear") {
        if (forgiveChoice === "all") {
          await api.post(`/api/rentals/${rental.id}/debt/forgive-overdue`, {
            target: "all",
            comment:
              "Прощение просрочки целиком при приёме оплаты",
          });
        } else if (forgiveChoice === "fine") {
          await api.post(`/api/rentals/${rental.id}/debt/forgive-overdue`, {
            target: "fine",
            comment: "Прощение штрафа просрочки при приёме оплаты",
          });
        } else if (forgiveChoice === "fine-n") {
          // v0.6.13: частичное прощение штрафа за N дней. Бэкенд при
          // target='fine' с daysCount списывает N × fineDailyRate.
          await api.post(`/api/rentals/${rental.id}/debt/forgive-overdue`, {
            target: "fine",
            daysCount: Math.max(1, Math.min(forgiveFineN, overdueDaysCount)),
            comment: `Прощение штрафа за ${forgiveFineN} дн просрочки при приёме оплаты`,
          });
        } else if (forgiveChoice === "days-all") {
          await api.post(`/api/rentals/${rental.id}/debt/forgive-overdue`, {
            target: "days",
            daysCount: Math.max(1, overdueDaysCount),
            comment: "Прощение всех неоплаченных дней при приёме оплаты",
          });
        } else if (forgiveChoice === "days-n") {
          await api.post(`/api/rentals/${rental.id}/debt/forgive-overdue`, {
            target: "days",
            daysCount: Math.max(1, Math.min(forgiveDaysN, overdueDaysCount)),
            comment: `Прощение ${forgiveDaysN} дн просрочки при приёме оплаты`,
          });
        }
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
      // v0.6.7: securityToUse=0 всегда (UI убран) — блок dead-code,
      //    оставлен на случай возврата функциональности.
      if (securityToUse > 0) {
        const securityMaxCurrent = rental.deposit ?? 0;
        const newDepositValue = Math.max(0, securityMaxCurrent - securityToUse);
        await api.patch(`/api/rentals/${rental.id}`, {
          deposit: newDepositValue,
          note:
            (rental.note ?? "") +
            (rental.note ? " · " : "") +
            `с залога списано ${securityToUse} ₽ в счёт долга`,
        });
      }
      // 3. Выполнить распределение всех принятых средств.
      // v0.6.11: пополнение залога — отдельный POST /security-topup,
      // ДО distribute (чтобы не путать с overpay). topupAmount уже
      // включён в acceptedStr → вычитаем его из accepted-аргумента
      // distribute, чтобы distribute не отправил эти деньги в долги.
      if (topupAmount > 0) {
        await api.post(`/api/rentals/${rental.id}/security-topup`, {
          amount: topupAmount,
          method: method === "cash" ? "cash" : "transfer",
        });
      }
      // v0.4.77: ПОРЯДОК ВАЖЕН. Раньше extend шёл ДО payment-операций,
      // и overdue_days_payment не сдвигал endPlanned (его уже сдвинул
      // extend в будущее). Теперь:
      //   3a. Платежи по просрочке/штрафу/manual/damage — сдвигают
      //       endPlanned до today (компенсируют просроченные дни).
      //   3b. extendInplaceAsync — сдвигает дальше за продление,
      //       создаёт rent placeholder paid=false.
      //   3c. Платежи по rent — PATCH placeholder paid=true.
      const acceptedForDistribute = Math.max(0, accepted - topupAmount);
      const ops = distribute(acceptedForDistribute);
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
  // v0.6.7: equipment/equipDaily объявлены выше (после dueAmount), здесь
  // только state открытия модалки экипировки.
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
  const coveredDaysShortage =
    mode === "amount"
      ? Math.floor(
          Math.max(0, accepted - debtPortion) /
            Math.max(1, dailyExtTotalBase),
        )
      : extDays;
  const uncoveredDaysShortage =
    mode === "amount" ? Math.max(0, extDays - coveredDaysShortage) : 0;
  const shortageAmount =
    mode === "amount" && uncoveredDaysShortage > 0
      ? Math.max(
          0,
          extDays * dailyExtTotalBase + debtPortion - accepted,
        )
      : 0;
  return (
    <>
      <div
        className={cn(
          // v0.6.x: inline-режим — панель встроена в layout RentalCard
          // (между CalendarPanel и HistoryStrip), вытесняя историю вправо.
          // Без fixed/backdrop/slide-in — просто блок в гриде.
          "flex h-full max-h-[820px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card-sm",
          closing && "opacity-0 transition-opacity duration-150",
        )}
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
              className="border-b border-border px-5 py-3"
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
              {/* v0.6.11: 2 карточки grid-cols-2 — «Погасить долг» / «Простить».
                  На «Простить» при hover/click показывается side popover со
                  списком 4 вариантов (все дни / N дней / только штраф / всё). */}
              <ForgiveStepCards
                forgiveChoice={forgiveChoice}
                setForgiveChoice={setForgiveChoice}
                forgiveDaysN={forgiveDaysN}
                setForgiveDaysN={setForgiveDaysN}
                forgiveFineN={forgiveFineN}
                setForgiveFineN={setForgiveFineN}
                fineDailyRate={fineDailyRate}
                overdueBalanceRaw={overdueBalanceRaw}
                overdueDaysBalanceRaw={overdueDaysBalanceRaw}
                overdueFineBalanceRaw={overdueFineBalanceRaw}
                overdueDaysCount={overdueDaysCount}
                hasOverdueDays={hasOverdueDays}
                hasOverdueFine={hasOverdueFine}
                onClear={setClearDebt}
                fmt={fmt}
              />
            </div>
          )}

          {/* ─── STEP 2: период продления ─────────────────────────────── */}
          <div className="border-b border-border px-5 py-3">
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
                      {extIsWeekly ? extDays : extInputBase}
                    </div>
                    <div className="text-[10px] text-muted">
                      {(extIsWeekly ? extDays : extInputBase) === 1
                        ? "день"
                        : (extIsWeekly ? extDays : extInputBase) < 5
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
                          // v0.6.15: при клике на пресет N дней — снимаем
                          // pin тарифа (если не custom), чтобы авто-подбор
                          // selectedTariff заработал по числу дней.
                          if (selectedTariff !== "custom") {
                            setTariffPinned(false);
                          }
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
            {/* v0.6.13: Тариф продления — pills + custom.
                Логика: при выборе пресета пересчитывается extRate из
                TARIFF[model][period]. При custom — поле ставки + toggle
                единиц (₽/сут / ₽/нед). См. блок выше где extRate/
                extDailyRate/extIsWeekly вычисляются из selectedTariff. */}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2 mr-1">
                Тариф
              </div>
              {(["short", "day", "week", "month"] as const).map((p) => {
                const r = TARIFF[rental.model][p];
                const active = selectedTariff === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      // v0.6.14: ручной выбор тарифа — пинним.
                      setSelectedTariff(p);
                      setTariffPinned(true);
                      // v0.6.15: при клике на тариф устанавливаем
                      // МИНИМАЛЬНОЕ число дней этого тарифа (по
                      // TARIFF_PERIOD_LABEL):
                      //   day   "1–2 дня"  → 1
                      //   short "3–6 дней" → 3
                      //   week  "7–29 дней"→ 7
                      //   month "30+ дней" → 30
                      // А не оставляем текущие 35 дней с пересчётом по
                      // ставке выбранного тарифа — это было ошибочное
                      // поведение. Заказчик хочет: «период сменится на 1
                      // день, а не пересчитаем 35 дней по новой цене».
                      const minDays =
                        p === "day"
                          ? 1
                          : p === "short"
                            ? 3
                            : p === "week"
                              ? 7
                              : 30;
                      // В week-режиме (extIsWeekly) extInputOverride
                      // хранит НЕДЕЛИ. Здесь мы переключаемся в day-режим
                      // (selectedTariff !== 'custom' → extIsWeekly=false),
                      // поэтому пишем дни.
                      setExtInputOverride(minDays);
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors flex items-center gap-1.5",
                      active
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-border text-muted hover:bg-surface-soft hover:text-ink-2",
                    )}
                    title={TARIFF_PERIOD_LABEL[p]}
                  >
                    <span>{TARIFF_PERIOD_LABEL[p]}</span>
                    <span className="tabular-nums">{r} ₽/сут</span>
                  </button>
                );
              })}
              <label className="ml-1 inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedTariff === "custom"}
                  onChange={(e) => {
                    // v0.6.14: вход/выход из custom — снимаем pin, чтобы
                    // авто-подбор по дням снова заработал при возврате
                    // в пресеты.
                    setSelectedTariff(e.target.checked ? "custom" : initialTariff);
                    setTariffPinned(e.target.checked);
                  }}
                  className="h-3.5 w-3.5 accent-blue-600"
                />
                <span className="text-[11px] font-semibold text-ink-2">
                  Свой тариф
                </span>
              </label>
              {selectedTariff === "custom" && (
                <div className="inline-flex items-stretch overflow-hidden rounded-[10px] border border-border">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={extCustomRate || ""}
                    onChange={(e) =>
                      setExtCustomRate(
                        Math.max(
                          0,
                          parseInt(
                            e.target.value.replace(/\D/g, "") || "0",
                            10,
                          ),
                        ),
                      )
                    }
                    placeholder="3000"
                    className="w-[80px] bg-white px-2 py-1 text-[12.5px] font-bold tabular-nums text-ink outline-none placeholder:text-muted-2"
                  />
                  <div className="inline-flex bg-surface-soft p-0.5">
                    {(["day", "week"] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setExtCustomUnit(u)}
                        className={cn(
                          "rounded-[6px] px-2 py-0.5 text-[10.5px] font-semibold transition-colors",
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
              <div className="ml-auto text-[10.5px] text-muted-2">
                {extIsWeekly
                  ? `${extRate} ₽/нед · ≈${extDailyRate} ₽/сут`
                  : `${extRate} ₽/сут`}
              </div>
            </div>
          </div>

          {/* ─── STEP 3: экипировка на новый период ─────────────────────
              v0.6.5: чипы кликабельны — открывают EquipmentChangeDialog
              для свапа (replaceAt) и добавления. По дизайну в правом
              верхнем углу — итог +N ₽/сут, и pill «+ Добавить». */}
          <div className="border-b border-border px-5 py-3">
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

          {/* v0.6.11: «Пополнение залога» — отдельная секция, видна
              когда залог денежный и rental.deposit < depositOriginal. */}
          {canTopupSecurity && (
            <div className="border-b border-border px-5 py-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white">
                  <Wallet size={11} />
                </span>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                  Пополнение залога
                </div>
                <div className="ml-auto text-[11px] text-muted">
                  Залог{" "}
                  <span className="font-semibold text-ink-2 tabular-nums">
                    {fmt(rentalDepositCurrent)} ₽
                  </span>{" "}
                  из{" "}
                  <span className="font-semibold text-ink-2 tabular-nums">
                    {fmt(rentalDepositOriginal)} ₽
                  </span>{" "}
                  — не хватает{" "}
                  <span className="font-semibold text-red-ink tabular-nums">
                    {fmt(securityShortage)} ₽
                  </span>
                </div>
              </div>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={topupSecurity}
                  onChange={(e) => {
                    setTopupSecurity(e.target.checked);
                    if (e.target.checked && !topupAmountStr) {
                      setTopupAmountStr(String(securityShortage));
                    }
                  }}
                  className="h-3.5 w-3.5 accent-amber-500"
                />
                <span className="text-[12px] font-semibold text-ink-2">
                  Пополнить залог
                </span>
                <span className="inline-flex items-stretch overflow-hidden rounded-[10px] border border-border">
                  <span className="bg-surface-soft px-2 py-1 text-[12px] font-bold text-muted">
                    +
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={topupAmountStr}
                    disabled={!topupSecurity}
                    onChange={(e) =>
                      setTopupAmountStr(e.target.value.replace(/\D/g, ""))
                    }
                    className={cn(
                      "w-[100px] bg-white px-2 py-1 text-[14px] font-bold tabular-nums text-ink outline-none",
                      !topupSecurity && "text-muted-2",
                    )}
                  />
                  <span className="flex items-center bg-surface-soft px-2 text-[12px] font-bold text-muted">
                    ₽
                  </span>
                </span>
                <span className="text-[11px] text-muted-2">
                  макс {fmt(securityShortage)} ₽
                </span>
              </label>
            </div>
          )}

          {/* v0.6.7: предупреждение «не хватает» — над footer'ом
              в режиме «по сумме клиента» (как в дизайне line 343-349). */}
          {shortageAmount > 0 && (
            <div className="px-5 py-3">
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
          {/* v0.6.7: удалены секции (дублирующие новый footer):
              · «Использовать депозит клиента» — checkbox в footer'е
              · «Списать с залога» — функциональность убрана из UI
              · «Принято от клиента, ₽» (mode='days') — авто-расчёт из дней
              · «Способ оплаты» (mode='amount') — pills в footer'е
              · «Переплата · X ₽ — куда направить?» — переплата всегда в продление
              · «Будет проведено» — итог теперь только в footer'е (2-кол) */}
        </div>

        {/* ─── FOOTER v0.6.5 ─── 2 колонки: краткая раскладка + К ПРИЁМУ ─── */}
        <div className="rounded-b-2xl border-t border-border bg-surface-soft px-5 py-3">
          <div className="grid grid-cols-12 items-end gap-4">
            <div className="col-span-7 flex flex-col gap-1 text-[11.5px]">
              {(() => {
                // v0.6.12: footer показывает реальные компоненты «К приёму»:
                //   - overdue (post-forgive остаток)
                //   - сколько прощено (если есть)
                //   - damage/manual/pendingRent (как «прочий долг»)
                //   - продление/экипировка
                //   - депозит/topup
                const overdueAfterForgive = overdueDaysBalance + overdueFineBalance;
                const overdueForgiven = overdueBalanceRaw - overdueAfterForgive;
                const otherDebt = pendingRent + damageBalance + manualBalance;
                return (
                  <>
                    {overdueAfterForgive > 0 && (
                      <FooterRow
                        label={`Закрытие просрочки${overdueDaysHeader > 0 ? ` · ${overdueDaysHeader} дн` : ""}`}
                        value={`${fmt(overdueAfterForgive)} ₽`}
                        tone="red"
                      />
                    )}
                    {overdueForgiven > 0 && (
                      <FooterRow
                        label="Просрочка прощена"
                        value={`−${fmt(overdueForgiven)} ₽`}
                        tone="green"
                      />
                    )}
                    {otherDebt > 0 && (
                      <FooterRow
                        label="Прочий долг (аренда/ущерб/ручной)"
                        value={`${fmt(otherDebt)} ₽`}
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
                    {topupAmount > 0 && (
                      <FooterRow
                        label="Пополнение залога"
                        value={`+${fmt(topupAmount)} ₽`}
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
                {fmt(Math.max(0, grossTotal - depositToUse))} ₽
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

      {/* v0.6.16: FloatingDragExtendCalendar убран. Календарь теперь живёт
          ТОЛЬКО в CalendarPanel карточки аренды (primary controller).
          Drag-to-extend в карточке обновляет initialExtDays при открытии
          этого side panel; дальше оператор может менять extDays
          спиннером прямо в panel'е. */}

      {/* v0.6.3: редактор экипировки открывается из Step 3 — отдельный
          диалог. После закрытия React Query инвалидирует rental,
          equipmentJson обновится автоматически. */}
      {equipDialogOpen && (
        <EquipmentChangeDialog
          rental={rental}
          onClose={() => setEquipDialogOpen(false)}
        />
      )}
    </>
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

/**
 * v0.6.11: Step 1 — две карточки «Погасить долг» / «Простить».
 *
 * Карточка «Простить» на hover (с 200ms delay) или click открывает side
 * popover со списком 4 вариантов:
 *   • Все неоплаченные дни ({overdueDaysCount} дн)
 *   • Только N дней (укажу сколько) — inline-input для N
 *   • Только штраф (без дней)
 *   • Всю просрочку (дни + штраф)
 *
 * Поведение:
 *  - hover «Простить» → через 200ms popover открывается
 *  - click → popover открывается мгновенно, не закрывается на mouseleave
 *  - клик на вариант → выставляет forgiveChoice + закрывает popover
 *  - клик вне popover (на overlay) → закрывает popover
 *  - при выборе «N дней» → inline-input для редактирования; popover при
 *    этом остаётся открытым, чтобы оператор мог поправить N
 */
function ForgiveStepCards({
  forgiveChoice,
  setForgiveChoice,
  forgiveDaysN,
  setForgiveDaysN,
  forgiveFineN,
  setForgiveFineN,
  fineDailyRate,
  overdueBalanceRaw,
  overdueDaysBalanceRaw,
  overdueFineBalanceRaw,
  overdueDaysCount,
  hasOverdueDays,
  hasOverdueFine,
  onClear,
  fmt,
}: {
  forgiveChoice: "clear" | "days-all" | "days-n" | "fine" | "fine-n" | "all";
  setForgiveChoice: (
    c: "clear" | "days-all" | "days-n" | "fine" | "fine-n" | "all",
  ) => void;
  forgiveDaysN: number;
  setForgiveDaysN: (n: number) => void;
  forgiveFineN: number;
  setForgiveFineN: (n: number) => void;
  fineDailyRate: number;
  overdueBalanceRaw: number;
  overdueDaysBalanceRaw: number;
  overdueFineBalanceRaw: number;
  overdueDaysCount: number;
  hasOverdueDays: boolean;
  hasOverdueFine: boolean;
  onClear: () => void;
  fmt: (n: number) => string;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverPinned, setPopoverPinned] = useState(false);
  const hoverTimer = useRef<number | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  // v0.6.12: позиция popover через portal — вычисляется по
  // getBoundingClientRect карточки «Простить». Iframe drawer'а имеет
  // overflow-hidden, поэтому absolute-popover обрезался — теперь
  // через React Portal с position:fixed.
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const forgiveSelected = forgiveChoice !== "clear";

  useLayoutEffect(() => {
    if (!popoverOpen) {
      setPopoverPos(null);
      return;
    }
    const updatePos = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const popoverW = 340;
      const popoverH = 280; // примерная высота — корректируется ниже
      const gap = 8;
      // По умолчанию справа от карточки.
      let left = rect.right + gap;
      let top = rect.top;
      // Если справа не хватает места — рисуем слева.
      if (left + popoverW > window.innerWidth - 8) {
        left = rect.left - popoverW - gap;
      }
      // Если слева тоже не хватает — рисуем по центру/снизу карточки.
      if (left < 8) {
        left = Math.max(8, rect.left);
        top = rect.bottom + gap;
      }
      // Не даём popover уйти ниже видимой области — поднимем при нужде.
      if (top + popoverH > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - popoverH - 8);
      }
      setPopoverPos({ top, left });
    };
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [popoverOpen, forgiveChoice]);

  const openOnHover = () => {
    if (hoverTimer.current != null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setPopoverOpen(true), 200);
  };
  const cancelHover = () => {
    if (hoverTimer.current != null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    if (!popoverPinned) setPopoverOpen(false);
  };
  const pinOpen = () => {
    setPopoverOpen(true);
    setPopoverPinned(true);
  };
  const closeAll = () => {
    setPopoverOpen(false);
    setPopoverPinned(false);
  };

  // Подпись под карточкой «Простить» — какой выбран вариант.
  const forgiveLabel: string =
    forgiveChoice === "days-all"
      ? "Все дни (+штраф за них)"
      : forgiveChoice === "days-n"
        ? `Только ${forgiveDaysN} ${forgiveDaysN === 1 ? "день" : forgiveDaysN < 5 ? "дня" : "дней"}`
        : forgiveChoice === "fine"
          ? "Только штраф"
          : forgiveChoice === "fine-n"
            ? `Штраф за ${forgiveFineN} ${forgiveFineN === 1 ? "день" : forgiveFineN < 5 ? "дня" : "дней"}`
            : forgiveChoice === "all"
              ? "Всю просрочку"
              : "Выберите вариант →";

  const fineTotal = overdueFineBalanceRaw;
  const daysAmount = overdueDaysBalanceRaw;
  const totalForgive = overdueBalanceRaw;

  return (
    <div className="relative grid grid-cols-2 gap-2">
      {/* «Погасить долг» */}
      <button
        type="button"
        onClick={() => {
          onClear();
          closeAll();
        }}
        className={cn(
          "rounded-[10px] border-2 bg-white px-3 py-2.5 text-left transition-colors",
          !forgiveSelected
            ? "border-blue-600"
            : "border-transparent bg-white/60 hover:bg-white",
        )}
      >
        <div className="text-[12.5px] font-bold text-ink">Погасить долг</div>
        <div className="mt-0.5 text-[11px] text-muted tabular-nums">
          {fmt(overdueBalanceRaw)} ₽
        </div>
      </button>

      {/* «Простить» с popover */}
      <div
        ref={anchorRef}
        className="relative"
        onMouseEnter={openOnHover}
        onMouseLeave={cancelHover}
      >
        <button
          type="button"
          onClick={() => {
            if (popoverOpen && popoverPinned) {
              closeAll();
            } else {
              pinOpen();
            }
          }}
          className={cn(
            "w-full rounded-[10px] border-2 bg-white px-3 py-2.5 text-left transition-colors",
            forgiveSelected
              ? "border-emerald-500"
              : "border-transparent bg-white/60 hover:bg-white",
          )}
        >
          <div className="flex items-center gap-1.5">
            <div className="text-[12.5px] font-bold text-green-ink">
              Простить
            </div>
            <ChevronRight
              size={12}
              className="text-muted-2"
            />
          </div>
          <div
            className={cn(
              "mt-0.5 text-[11px] tabular-nums",
              forgiveSelected ? "text-emerald-700 font-semibold" : "text-muted",
            )}
          >
            {forgiveLabel}
          </div>
        </button>

        {popoverOpen && popoverPos != null && createPortal(
          <>
            {/* overlay для click-outside — рендерится в портале поверх
                bottom-drawer'а (z выше drawer z-[120]). */}
            <div
              className="fixed inset-0 z-[200]"
              onClick={closeAll}
            />
            <div
              className="fixed z-[201] w-[340px] rounded-[12px] border border-border bg-white shadow-card-lg"
              style={{ top: popoverPos.top, left: popoverPos.left }}
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={() => setPopoverOpen(true)}
            >
              {/* Все неоплаченные дни */}
              {hasOverdueDays && (
                <ForgiveOption
                  active={forgiveChoice === "days-all"}
                  onClick={() => {
                    setForgiveChoice("days-all");
                    closeAll();
                  }}
                  title={`Все неоплаченные дни (${overdueDaysCount} дн)`}
                  description={`−${fmt(daysAmount + fineTotal)} ₽: дни ${fmt(daysAmount)} ₽ + штраф за эти дни ${fmt(fineTotal)} ₽. endPlanned +${overdueDaysCount} дн.`}
                />
              )}
              {/* Только N дней */}
              {hasOverdueDays && overdueDaysCount > 1 && (
                <div
                  className={cn(
                    "border-t border-border",
                    forgiveChoice === "days-n" ? "bg-emerald-50" : "",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setForgiveChoice("days-n")}
                    className="w-full px-3 py-2.5 text-left hover:bg-surface-soft"
                  >
                    <div className="text-[12.5px] font-bold text-ink">
                      Только N дней (укажу сколько)
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      Простит выбранные дни (включая штраф за эти же дни).
                      Остальные останутся в долге.
                    </div>
                  </button>
                  {forgiveChoice === "days-n" && (
                    <div className="flex items-center gap-2 border-t border-border bg-white px-3 py-2">
                      <span className="text-[11.5px] font-semibold text-ink-2">
                        N =
                      </span>
                      <div className="inline-flex items-stretch overflow-hidden rounded-[8px] border border-border">
                        <button
                          type="button"
                          onClick={() =>
                            setForgiveDaysN(Math.max(1, forgiveDaysN - 1))
                          }
                          className="flex w-7 items-center justify-center bg-surface-soft text-[14px] text-muted hover:text-ink"
                        >
                          −
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={forgiveDaysN}
                          onChange={(e) => {
                            const n = Math.max(
                              1,
                              Math.min(
                                overdueDaysCount,
                                parseInt(
                                  e.target.value.replace(/\D/g, "") || "1",
                                  10,
                                ),
                              ),
                            );
                            setForgiveDaysN(n);
                          }}
                          className="w-10 bg-white px-1 py-1 text-center text-[13px] font-bold tabular-nums text-ink outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setForgiveDaysN(
                              Math.min(overdueDaysCount, forgiveDaysN + 1),
                            )
                          }
                          className="flex w-7 items-center justify-center bg-surface-soft text-[14px] text-muted hover:text-ink"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-[10.5px] text-muted-2">
                        из {overdueDaysCount} дн
                      </span>
                      <button
                        type="button"
                        onClick={closeAll}
                        className="ml-auto rounded-full bg-emerald-500 px-2.5 py-1 text-[10.5px] font-bold text-white hover:bg-emerald-600"
                      >
                        OK
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* Только штраф */}
              {hasOverdueFine && (
                <ForgiveOption
                  topBorder
                  active={forgiveChoice === "fine"}
                  onClick={() => {
                    setForgiveChoice("fine");
                    closeAll();
                  }}
                  title="Только штраф (без дней)"
                  description={`−${fmt(fineTotal)} ₽ — штраф 50% × дни. Дни просрочки и endPlanned не меняются.`}
                />
              )}
              {/* v0.6.13: «Штраф за N дней» — частичное прощение штрафа.
                  Бэкенд расширен: target='fine' + daysCount = N. Дни и
                  endPlanned не двигаются, прощается только N × fineDaily. */}
              {hasOverdueFine && overdueDaysCount > 1 && (
                <div
                  className={cn(
                    "border-t border-border",
                    forgiveChoice === "fine-n" ? "bg-emerald-50" : "",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setForgiveChoice("fine-n")}
                    className="w-full px-3 py-2.5 text-left hover:bg-surface-soft"
                  >
                    <div className="text-[12.5px] font-bold text-ink">
                      Штраф за N дней
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      Простит штраф только за выбранные дни просрочки
                      ({fmt(fineDailyRate)} ₽/день). Сами дни и
                      endPlanned не двигаются.
                    </div>
                  </button>
                  {forgiveChoice === "fine-n" && (
                    <div className="flex items-center gap-2 border-t border-border bg-white px-3 py-2">
                      <span className="text-[11.5px] font-semibold text-ink-2">
                        N =
                      </span>
                      <div className="inline-flex items-stretch overflow-hidden rounded-[8px] border border-border">
                        <button
                          type="button"
                          onClick={() =>
                            setForgiveFineN(Math.max(1, forgiveFineN - 1))
                          }
                          className="flex w-7 items-center justify-center bg-surface-soft text-[14px] text-muted hover:text-ink"
                        >
                          −
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={forgiveFineN}
                          onChange={(e) => {
                            const n = Math.max(
                              1,
                              Math.min(
                                overdueDaysCount,
                                parseInt(
                                  e.target.value.replace(/\D/g, "") || "1",
                                  10,
                                ),
                              ),
                            );
                            setForgiveFineN(n);
                          }}
                          className="w-10 bg-white px-1 py-1 text-center text-[13px] font-bold tabular-nums text-ink outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setForgiveFineN(
                              Math.min(overdueDaysCount, forgiveFineN + 1),
                            )
                          }
                          className="flex w-7 items-center justify-center bg-surface-soft text-[14px] text-muted hover:text-ink"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-[10.5px] text-muted-2">
                        ≈ {fmt(forgiveFineN * fineDailyRate)} ₽
                      </span>
                      <button
                        type="button"
                        onClick={closeAll}
                        className="ml-auto rounded-full bg-emerald-500 px-2.5 py-1 text-[10.5px] font-bold text-white hover:bg-emerald-600"
                      >
                        OK
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* Всю просрочку */}
              {hasOverdueDays && hasOverdueFine && (
                <ForgiveOption
                  topBorder
                  active={forgiveChoice === "all"}
                  onClick={() => {
                    setForgiveChoice("all");
                    closeAll();
                  }}
                  title="Всю просрочку (дни + штраф)"
                  description={`−${fmt(totalForgive)} ₽. endPlanned +${overdueDaysCount} дн.`}
                  tone="red"
                />
              )}
            </div>
          </>,
          document.body,
        )}
      </div>
    </div>
  );
}

function ForgiveOption({
  active,
  topBorder,
  onClick,
  title,
  description,
  tone,
}: {
  active: boolean;
  topBorder?: boolean;
  onClick: () => void;
  title: string;
  description: string;
  tone?: "red";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full px-3 py-2.5 text-left hover:bg-surface-soft transition-colors",
        topBorder && "border-t border-border",
        active && "bg-emerald-50",
      )}
    >
      <div
        className={cn(
          "text-[12.5px] font-bold",
          tone === "red" ? "text-red-ink" : "text-ink",
        )}
      >
        {title}
      </div>
      <div className="mt-0.5 text-[11px] text-muted">{description}</div>
    </button>
  );
}
