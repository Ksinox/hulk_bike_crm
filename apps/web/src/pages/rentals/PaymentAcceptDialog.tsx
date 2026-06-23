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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Lock,
  X,
  Repeat,
  Coins,
  Calendar as CalendarIcon,
  ChevronRight,
  ChevronLeft,
  Banknote,
  CreditCard,
  CheckCircle2,
  Circle,
  Minus,
  Plus,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast, confirmDialog } from "@/lib/toast";
import { toastRentalDone } from "./rentalUndo";
import { api } from "@/lib/api";
import {
  useApiClients,
  useClientDebtSources,
  usePayClientDamageDebt,
} from "@/lib/api/clients";
import { useApiPayments } from "@/lib/api/payments";
import { useRentalDebt, equipmentDebtPortion } from "@/lib/api/debt";
import { useRentalParking, unpaidParkingTotal } from "@/lib/api/parking";
import { SquareParking } from "lucide-react";
import {
  extendInplaceAsync,
  getRentalChainIds,
  useRentals,
  useArchivedRentals,
  completeRentalNoDamage,
  completeRentalWithDamage,
} from "./rentalsStore";
import { useReturnIntake, ReturnIntakeSection, ReturnDamagePicker } from "./returnIntake";
import {
  useCreateDamageReport,
  useUploadDamageMedia,
} from "@/lib/api/damage-reports";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { EquipmentTile, EquipmentAddTile } from "./rental-card/EquipmentTile";
import type { Rental } from "@/lib/mock/rentals";
import type { PaymentMethod } from "@/lib/mock/rentals";
import {
  periodForDays,
  TARIFF_PERIOD_LABEL,
  type TariffPeriod,
} from "@/lib/mock/rentals";
import { useModelRateResolver } from "@/lib/api/scooter-models";
import { I18nProvider } from "react-aria-components";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { Calendar as CalendarPicker } from "@/components/ui/calendar-rac";
import {
  effectiveOverdueDaysAsOf,
  operatorDelayDays,
  ruToIsoDate,
} from "./overdueAsOf";
import { useIsMobile } from "@/lib/useIsMobile";
import { MobileNumPad } from "@/mobile/MobileNumPad";

// v0.4.30: терминала для карт у бизнеса нет — только наличные и
// перевод. «card» остаётся в типе PaymentMethod ради обратной
// совместимости с историческими записями в БД, но в UI-селекторах
// больше не показывается.
const METHODS: { id: PaymentMethod; label: string; Icon: typeof Banknote }[] = [
  { id: "cash", label: "Наличные", Icon: Banknote },
  { id: "transfer", label: "Перевод", Icon: CreditCard },
];

// v0.8.32: тарифные «ступени» по числу дней продления. Источник истины
// для согласованного расчёта в режиме «по сумме клиента»:
//   1–2 дня   → day
//   3–6 дней  → short
//   7–29 дней → week
//   30+ дней  → month
// Ключевой инвариант: число дней, посчитанное по ставке ступени, должно
// попадать в её же диапазон [min, max] — иначе ступень недопустима для
// этой суммы (нельзя получить месячный тариф 400 ₽ всего на 7 дней).
const EXT_TIERS: { period: TariffPeriod; min: number; max: number }[] = [
  { period: "day", min: 1, max: 2 },
  { period: "short", min: 3, max: 6 },
  { period: "week", min: 7, max: 29 },
  { period: "month", min: 30, max: Infinity },
];

export function PaymentAcceptDialog({
  rental,
  onClose,
  onPaid,
  initialExtDays,
  onExtDaysChange,
  onPaymentDateChange,
  liftedFromRect,
  inline = false,
  completing = false,
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
   * v0.9.4: callback наверх при изменении даты фактической оплаты (back-date).
   * Rentals прокидывает её в карточку → календарь якорит превью продления на
   * max(plannedEnd, дата оплаты), синхронно с «новым возвратом» в окне.
   */
  onPaymentDateChange?: (iso: string) => void;
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
  /** Встроенный режим для карточки аренды: панель занимает третью колонку, без overlay. */
  inline?: boolean;
  /** Режим завершения аренды: прячем продление и пополнение залога (им тут
   *  не место — мы завершаем), способы оплаты те же. Этап 1 редизайна
   *  завершения; дальше сюда переедет приёмка позиций. */
  completing?: boolean;
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

  // ── Этап 2: приёмка позиций при завершении аренды (единое окно) ──
  // Хук владеет состоянием приёмки. enabled=completing — при обычном
  // приёме оплаты запросов не делает и отдаёт пустую приёмку.
  const intake = useReturnIntake(rental, completing);
  // Зачёт залога в счёт ущерба: по умолчанию весь применимый залог идёт
  // в ущерб (переключатель «вернуть залог клиенту»).
  const [returnDepositInstead, setReturnDepositInstead] = useState(false);
  const createDamageReport = useCreateDamageReport();
  const uploadDamageMedia = useUploadDamageMedia();
  // v0.9.1: после завершения показываем акт возврата для печати.
  const [actPreviewRentalId, setActPreviewRentalId] = useState<number | null>(null);
  // v0.9.3: меню «простить просрочку» (по клику) в режиме завершения.
  const [forgiveMenuOpen, setForgiveMenuOpen] = useState(false);

  // ── Мобильный пошаговый мастер завершения (3 шага) ──
  //  0 — приёмка (Цел/Ущерб по позициям; «Ущерб» → полноэкранный пикер),
  //  1 — счёт (просрочка+прощение, зачёт залога, долги, итого),
  //  2 — оплата (нативная клавиатура «платит сейчас» + способ → Завершить).
  // Десктоп использует прежний двухколоночный completingPanel без изменений.
  const isMobile = useIsMobile();
  const [cStep, setCStep] = useState(0);
  const [cStepDir, setCStepDir] = useState<"fwd" | "back">("fwd");
  const [payNumpadOpen, setPayNumpadOpen] = useState(false);
  const goCStep = (n: number) => {
    setCStepDir(n >= cStep ? "fwd" : "back");
    setCStep(n);
  };

  // ── Мобильный мастер «Принять платёж» (mid-rental, без завершения): 2 шага ──
  //  0 — Долг (состав + сколько гасит + прощение), 1 — Оплата (источники
  //  залог/депозит + способ + К приёму). Продление здесь НЕ делаем — оно
  //  живёт тумблером extendOn в десктоп-режиме «Принять оплату».
  const [payStep, setPayStep] = useState(0);
  const [payStepDir, setPayStepDir] = useState<"fwd" | "back">("fwd");
  const goPayStep = (n: number) => {
    setPayStepDir(n >= payStep ? "fwd" : "back");
    setPayStep(n);
  };
  // Какое поле редактирует нативная клавиатура в этом мастере.
  const [payPad, setPayPad] = useState<null | "cash" | "security" | "deposit">(
    null,
  );
  // Оператор вручную задал «клиент вносит» (частичная оплата) → не
  // перерассчитываем наличные автоматически от остатка.
  const [cashTouched, setCashTouched] = useState(false);

  // Неоплаченная аренда (rent payments paid=false)
  const pendingRent = useMemo(() => {
    return payments
      .filter(
        (p) =>
          p.rentalId === rental.id && p.type === "rent" && !p.paid,
      )
      .reduce((s, p) => s + p.amount, 0);
  }, [payments, rental.id]);

  // #20-B: неоплаченная доплата за замену скутера (swap_fee, paid=false).
  // Раньше не попадала ни в pendingRent (фильтр type==="rent"), ни в состав
  // долга к приёму — висела в KPI «Долг», но собрать её через окно было нельзя.
  // Теперь — отдельной строкой и слотом в распределении (как rent).
  const pendingSwapFee = useMemo(() => {
    return payments
      .filter(
        (p) => p.rentalId === rental.id && p.type === "swap_fee" && !p.paid,
      )
      .reduce((s, p) => s + p.amount, 0);
  }, [payments, rental.id]);

  // v0.9.1: дата фактического поступления оплаты — «ЯКОРЬ ОТСЧЁТА».
  // По умолчанию сегодня. Оператор может указать прошедшую дату: клиент
  // заплатил вовремя, но зафиксировали позже. Тогда «как будто сегодня =
  // эта дата»: просрочка считается НА неё, а продление/закрытие — ОТ неё.
  // Это НЕ прощение просрочки — просто точка отсчёта дальнейших операций.
  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const [paymentDateIso, setPaymentDateIso] = useState<string>(todayIso);
  const [dateConfirmed, setDateConfirmed] = useState(false);
  // back-date активен, когда подтверждена ПРОШЕДШАЯ дата оплаты.
  const isBackdated = dateConfirmed && paymentDateIso !== todayIso;
  // Timestamp для paidAt платежей: выбранная дата (полдень) или «сейчас».
  const paymentTimestamp = useMemo(
    () =>
      paymentDateIso && paymentDateIso !== todayIso
        ? new Date(paymentDateIso + "T12:00:00").toISOString()
        : null,
    [paymentDateIso, todayIso],
  );

  // v0.9: дневная ставка = аренда/сут (week → /7) + платная экипировка/сут;
  // штраф 50% от суммы за сутки (синхронно с бэкендом).
  const equipDailyForOverdue = (rental.equipmentJson ?? []).reduce(
    (s, e) => s + (e.free ? 0 : e.price),
    0,
  );
  const dailyRateBase =
    (rental.rateUnit === "week"
      ? Math.max(1, Math.round(rental.rate / 7))
      : Math.max(1, rental.rate)) + equipDailyForOverdue;
  const fineDailyRate = Math.round(dailyRateBase * 0.5);

  // Компоненты долга. На СЕГОДНЯ берём из API (учитывают частичные
  // оплаты/прощения). При back-date — пересчитываем просрочку НА дату
  // оплаты: дни = max(0, дата − плановыйВозврат), долг = дни × ставка.
  const realOverdueDaysAsOf = effectiveOverdueDaysAsOf(
    rental.endPlanned,
    paymentDateIso,
  );
  const overdueDaysCount = isBackdated
    ? realOverdueDaysAsOf
    : debt?.overdueDays ?? 0;
  const overdueDaysBalanceRaw = isBackdated
    ? overdueDaysCount * dailyRateBase
    : debt?.overdueDaysBalance ?? 0;
  const overdueFineBalanceRaw = isBackdated
    ? overdueDaysCount * fineDailyRate
    : debt?.overdueFineBalance ?? 0;
  const damageBalance = debt?.damageBalance ?? 0;
  const manualBalance = debt?.manualBalance ?? 0;
  // #179: «за экипировку» (доплата за смену экипировки на аренде) против
  // обезличенного «ручного начисления» — чтобы у долга была понятная подпись.
  const equipmentManualBalance = equipmentDebtPortion(debt);
  const otherManualBalance = Math.max(0, manualBalance - equipmentManualBalance);

  // v0.6.11: одно состояние выбора действия по просрочке (Step 1).
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
  // v0.9: разнос «дней» на аренду и платную экипировку (3 строки в UI).
  const overdueEquipCharge = equipDailyForOverdue * overdueDaysCount;
  const overdueRentDaysCharge = Math.max(
    0,
    overdueDaysBalanceRaw - overdueEquipCharge,
  );
  const [forgiveChoice, setForgiveChoice] = useState<ForgiveChoice>("clear");
  const [forgiveDaysN, setForgiveDaysN] = useState<number>(1);
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

  // #81: ставка ₽/сут по тарифному периоду — из каталога «Модели» (БД),
  // фолбэк на legacy TARIFF. Единый источник цен с формой аренды.
  const resolveRate = useModelRateResolver();
  const modelRate = useCallback(
    (p: TariffPeriod) => resolveRate(rental, p),
    // Зависим от примитивов (а не от объекта rental), чтобы функция была
    // стабильной между рендерами — иначе amount-effect зациклится.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolveRate, rental.scooterId, rental.model],
  );
  // v0.6.14: tariffPinned — флаг, что оператор вручную выбрал тариф.
  // Тогда useEffect ниже НЕ перетирает selectedTariff при изменении extDays.
  // Сбрасывается только при выборе custom (через checkbox).
  const [tariffPinned, setTariffPinned] = useState<boolean>(false);
  // #170: подсказка «применить прошлые условия» (скрывается по «Нет»).
  const [priorHintDismissed, setPriorHintDismissed] = useState(false);
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
  //
  // initialExtDays — это число ДНЕЙ. extInputOverride хранится в единице
  // ВВОДА продления: в custom-недельном тарифе это НЕДЕЛИ, иначе дни.
  // Делим по единице ПРОДЛЕНИЯ (selectedTariff/extCustomUnit), а НЕ по
  // rental.rateUnit (единица исходной аренды). Старый код делил по rateUnit:
  // при custom-недельном тарифе extInputBase множился ×7 на каждом рендере
  // (extDays → onExtDaysChange → initialExtDays → extInputOverride), уходя
  // в экспоненту → дата NaN.NaN.NaN и «космическая» сумма.
  useEffect(() => {
    if (initialExtDays == null || initialExtDays <= 0) return;
    const weekly = selectedTariff === "custom" && extCustomUnit === "week";
    const next = weekly
      ? Math.max(1, Math.round(initialExtDays / 7))
      : initialExtDays;
    setExtInputOverride(next);
  }, [initialExtDays, selectedTariff, extCustomUnit]);

  // #170: прошлый срок (по тарифной ступени последних условий) + применение
  // прошлых условий в окно продления. Точные дни последнего продления в БД не
  // хранятся (days — накопительный итог), поэтому срок берём по ступени.
  const priorDays =
    rental.rateUnit === "week"
      ? 7
      : rental.tariffPeriod === "month"
        ? 30
        : rental.tariffPeriod === "week"
          ? 7
          : rental.tariffPeriod === "short"
            ? 4
            : 2;
  const applyPriorConditions = () => {
    setMode("days");
    if (rental.customTariff) {
      setSelectedTariff("custom");
      setTariffPinned(true);
      setExtCustomRate(rental.rate);
      setExtCustomUnit(rental.rateUnit === "week" ? "week" : "day");
    }
    setExtInputOverride(
      rental.rateUnit === "week"
        ? Math.max(1, Math.round(priorDays / 7))
        : priorDays,
    );
    setPriorHintDismissed(true);
  };
  // v0.6.13: тариф продления вычисляется из selectedTariff.
  //   - preset (short/day/week/month) → ставка из TARIFF, unit = 'day'
  //     (период недельного тарифа всё равно считается в днях по ставке/сут;
  //     только если оператор явно выбрал custom unit='week' — тогда week).
  //   - 'custom' → extCustomRate + extCustomUnit
  const extIsWeekly =
    selectedTariff === "custom" && extCustomUnit === "week";
  const extRate = (() => {
    if (selectedTariff === "custom") return Math.max(0, extCustomRate);
    return modelRate(selectedTariff);
  })();
  const extDailyRate = extIsWeekly ? Math.max(1, Math.round(extRate / 7)) : extRate;
  // v0.6.7: экипировка ВСЕГДА учитывается в формуле дней/суммы продления
  // (см. extension-drawer.jsx line 14-15: dailyTotal = rate + equipDaily).
  // Перенесли определение equipment/equipDaily сюда (выше acceptedStr),
  // чтобы синхронизация суммы работала корректно.
  //
  // #177: экипировка НА НОВЫЙ ПЕРИОД — отдельный ЛОКАЛЬНЫЙ набор. НЕ мутирует
  // rental.equipmentJson и НЕ дёргает equipmentChangeAsync (это списывало бы
  // остаток текущего периода и требовало способ оплаты). По умолчанию =
  // текущая экипировка (клиент обычно продолжает с тем же), оператор может
  // добавить/убрать/заменить именно для продления. Стоимость считается ТОЛЬКО
  // за дни продления: equipSum = equipDaily × extDays — складывается в
  // «К приёму» без отдельного способа оплаты. При сабмите набор уходит в
  // extend-inplace (бэк фиксирует его как текущую экипировку аренды).
  const [extEquipment, setExtEquipment] = useState<
    Array<{ itemId?: number | null; name: string; price: number; free: boolean }>
  >(() =>
    (rental.equipmentJson ?? []).map((e) => ({
      itemId: e.itemId ?? null,
      name: e.name,
      price: e.price,
      free: e.free,
    })),
  );
  const equipment = extEquipment;
  const equipDaily = equipment.reduce(
    (s, e) => s + (e.free ? 0 : e.price),
    0,
  );
  // v0.8.0: паркинг — неоплаченный остаток входит в «К приёму», если
  // оператор включил его оплату (по умолчанию да, когда есть паркинг).
  const { sessions: parkingSessionsList } = useRentalParking(rental.id);
  const unpaidParking = unpaidParkingTotal(parkingSessionsList);
  const unpaidParkingDays = parkingSessionsList
    .filter((s) => s.amount > s.paidAmount)
    .reduce((sum, s) => sum + s.days, 0);
  const [payParking, setPayParking] = useState(true);
  const parkingDue = unpaidParking > 0 && payParking ? unpaidParking : 0;

  // Этап 2: ущерб по приёмке (только в режиме завершения). Залог по
  // умолчанию идёт в счёт ущерба; «вернуть залог» обнуляет зачёт.
  const intakeDamageTotal = completing ? intake.totalDamage : 0;
  const depositForZachet = rental.deposit ?? 0;
  const depositZachet =
    completing && intake.hasDamage && !returnDepositInstead
      ? Math.min(depositForZachet, intakeDamageTotal)
      : 0;
  // Остаток ущерба после зачёта залога → ляжет долгом на акт (мягкий долг).
  const intakeDamageDebt = Math.max(0, intakeDamageTotal - depositZachet);
  // Сколько залога вернётся клиенту (для подсказки в расчёте).
  const depositReturnToClient =
    completing && intake.hasDamage
      ? Math.max(0, depositForZachet - depositZachet)
      : 0;

  // Долги (без extend — он считается по переплате)
  const totalDebt =
    pendingRent +
    pendingSwapFee +
    overdueDaysBalance +
    overdueFineBalance +
    damageBalance +
    manualBalance +
    intakeDamageDebt;
  // C3: «клиент вносит по долгу сейчас» — ОДНА сумма против общего долга.
  // Пусто = гасим полностью (как было). Можно ввести меньше → частичное
  // погашение: distribute() раскидает её по составу (просрочка→штраф→ущерб→…)
  // по приоритету. Формулы и накопление долга НЕ трогаем — завтра он снова
  // подрастёт штатно. Ограничиваем введённое суммой долга.
  const [debtPayStr, setDebtPayStr] = useState("");
  const paidDebtNow =
    debtPayStr.trim() === ""
      ? totalDebt
      : Math.max(
          0,
          Math.min(
            totalDebt,
            parseInt(debtPayStr.replace(/\D/g, "") || "0", 10),
          ),
        );
  const isPartialDebt = totalDebt > 0 && paidDebtNow < totalDebt;
  const debtRemainAfter = Math.max(0, totalDebt - paidDebtNow);
  // dueAmount теперь = сколько по долгу гасим СЕЙЧАС + паркинг (а не весь долг).
  const dueAmount = paidDebtNow + parkingDue;

  // ── Сквозной долг клиента: ущерб с ПРОШЛЫХ аренд (F3) ──
  // Долг по ущербу «переезжает» за клиентом. В «Принять платёж» его не было
  // видно — оператор не мог его погасить. Показываем отдельным блоком и
  // принимаем оплату через /clients/:id/pay-damage-debt. Долг ТЕКУЩЕЙ цепочки
  // исключаем — он уже учтён в totalDebt (damageBalance).
  const { data: clientDebtSources = [] } = useClientDebtSources(rental.clientId);
  const activeRentalsAll = useRentals();
  const archivedRentalsAll = useArchivedRentals();
  const currentChainIds = useMemo(
    () =>
      getRentalChainIds(rental.id, [
        ...activeRentalsAll,
        ...archivedRentalsAll,
      ]),
    [rental.id, activeRentalsAll, archivedRentalsAll],
  );
  const crossSources = useMemo(
    () =>
      clientDebtSources.filter((s) => !currentChainIds.includes(s.rentalId)),
    [clientDebtSources, currentChainIds],
  );
  const crossDebtTotal = crossSources.reduce((s, x) => s + x.amount, 0);
  const [crossPayStr, setCrossPayStr] = useState("");
  const crossPayNow =
    crossPayStr.trim() === ""
      ? crossDebtTotal
      : Math.max(
          0,
          Math.min(
            crossDebtTotal,
            parseInt(crossPayStr.replace(/\D/g, "") || "0", 10),
          ),
        );
  const [crossMethod, setCrossMethod] = useState<"cash" | "transfer">(
    "cash",
  );
  const payCrossDebt = usePayClientDamageDebt();
  const handlePayCrossDebt = async () => {
    if (crossPayNow <= 0 || payCrossDebt.isPending) return;
    try {
      const res = await payCrossDebt.mutateAsync({
        clientId: rental.clientId,
        amount: crossPayNow,
        method: crossMethod,
      });
      toast.success(
        "Долг с прошлых аренд погашен",
        `Принято ${fmt(res.paid)} ₽${
          res.paid < crossDebtTotal
            ? ` · останется ${fmt(crossDebtTotal - res.paid)} ₽`
            : ""
        }`,
      );
      setCrossPayStr("");
    } catch (e) {
      toast.error(
        "Не удалось принять оплату по долгу",
        (e as Error).message ?? "",
      );
    }
  };

  // Источники
  // v0.6.7: депозит управляется одним checkbox'ом в footer'е (как в
  // extension-drawer.jsx). v0.6.51: при включении списываем РОВНО сколько
  // нужно для оплаты — min(остаток депозита, итог к оплате), НЕ весь баланс.
  // depositToUse/remainingAfterDeposit считаются ниже, после grossTotal.
  const [useDeposit, setUseDeposit] = useState<boolean>(false);
  // Сумма к списанию с депозита клиента (пусто → максимум). Тумблер + поле.
  const [depositToUseStr, setDepositToUseStr] = useState<string>("");
  // «Из залога»: гасить долг деньгами залога аренды (rental.deposit).
  const [useSecurity, setUseSecurity] = useState<boolean>(false);
  // Сумма к списанию с залога (пусто → максимум). Тумблер + поле + комментарий.
  const [securityToUseStr, setSecurityToUseStr] = useState<string>("");
  const [securityComment, setSecurityComment] = useState<string>("");

  // v0.8.33 (K1): блок «Закрыть из залога» удалён — функциональность
  // переехала в RentalActionDialog («Закрыть аренду»). При продлении
  // залог не трогаем, он лежит до завершения аренды.

  // Пополнение залога ПЕРЕЕХАЛО на плашку «Залог» в «Финансовой информации»
  // (тап → диалог «Пополнить залог»). В приёме оплаты пополнять залог нелогично
  // (тут принимаем долг ОТ клиента), поэтому topupAmount=0 — все формулы
  // `+ topupAmount` остаются, но ничего не прибавляют.
  const rentalDepositCurrent = rental.deposit ?? 0;
  const topupAmount = 0;

  // «Из залога» (#26): гасим долг деньгами залога. Доступно когда залог
  // денежный и после авто-зачёта по приёмке ущерба (depositZachet) что-то
  // осталось. Берём не больше остатка залога и не больше гасимого сейчас долга
  // (чтобы залог не «перелился» в продление/кошелёк клиента — distribute
  // съест его строго по долговым слотам).
  const securityAvailable = Math.max(0, rentalDepositCurrent - depositZachet);
  const canUseSecurity =
    !rental.depositItem && securityAvailable > 0 && paidDebtNow > 0;
  // Максимум, что есть смысл взять из залога: остаток залога, но не больше
  // гасимого сейчас долга. Поле суммы пустое → берём максимум (удобный дефолт),
  // иначе — введённую сумму, клампим к максимуму.
  const securityCap = Math.min(securityAvailable, paidDebtNow);
  const securityToUse = !(useSecurity && canUseSecurity)
    ? 0
    : securityToUseStr.trim() === ""
      ? securityCap
      : Math.min(
          securityCap,
          Math.max(0, parseInt(securityToUseStr.replace(/\D/g, "") || "0", 10)),
        );

  // v0.6.7: extInputBase — кол-во ЕДИНИЦ продления (дней или недель).
  //   mode='days'   → управляется через спиннер/quick-presets (extInputOverride).
  //   mode='amount' → вычисляется из amountInput (см. useEffect ниже).
  // В режиме days дефолт = 0 (оператор явно жмёт + или quick-pill),
  // если только не пришёл initialExtDays (drag-to-extend).
  // R1: продление прячем за тумблер. Выкл (по умолчанию) → блоки продления
  // скрыты и extDays=0 (никакого начисления за продление), остаётся только
  // оплата долга/просрочки. Вкл → весь функционал продления. Если пришёл
  // initialExtDays (drag-to-extend на календаре) — тумблер сразу включён.
  const [extendOn, setExtendOn] = useState<boolean>(
    () => (initialExtDays ?? 0) > 0,
  );
  const extInputBase = extendOn ? Math.max(0, extInputOverride ?? 0) : 0;
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
  // v0.9.4: сообщаем выбранную дату оплаты наверх — карточный календарь
  // якорит превью продления на неё (max(plannedEnd, дата оплаты)).
  useEffect(() => {
    onPaymentDateChange?.(paymentDateIso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentDateIso]);
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
    // v0.8.32: в режиме «по сумме клиента» тариф выбирается единым
    // проходом в amount-effect (ниже) — здесь не вмешиваемся, иначе
    // получается петля «сумма→дни→тариф→сумма».
    if (mode === "amount") return;
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
  }, [extDays, tariffPinned, selectedTariff, mode]);
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
  // v0.6.51: депозит покрывает РОВНО столько, сколько нужно — min(остаток
  // депозита, grossTotal). Излишек остаётся на депозите клиента (раньше
  // checkbox списывал ВЕСЬ баланс, даже если к оплате было меньше — клиент
  // терял лишнее, а «к оплате» не сходилось с тем, что просит модуль).
  // Залог (securityToUse) списывается первым, депозит клиента — на остаток.
  // Берём введённую сумму, но не больше баланса депозита и не больше остатка к
  // оплате после залога. Пусто → максимум.
  const depositCap = Math.min(
    depositBalance,
    Math.max(0, grossTotal - securityToUse),
  );
  const depositToUse = !useDeposit
    ? 0
    : depositToUseStr.trim() === ""
      ? depositCap
      : Math.min(
          depositCap,
          Math.max(0, parseInt(depositToUseStr.replace(/\D/g, "") || "0", 10)),
        );
  const remainingAfterDeposit = Math.max(
    0,
    grossTotal - securityToUse - depositToUse,
  );
  const remainingAfterSecurity = remainingAfterDeposit;
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
    // На мобиле наличные = остаток после залога/депозита, но оператор может
    // ввести меньше (частичная оплата) — тогда cashTouched и авто-перерасчёт
    // выключается, чтобы залог/депозит не «съедали» введённую сумму.
    if (isMobile && cashTouched) return;
    const target = Math.max(0, grossTotal - securityToUse - depositToUse);
    setAcceptedStr(target > 0 ? String(target) : "");
  }, [grossTotal, securityToUse, depositToUse, mode, isMobile, cashTouched]);

  const accepted = Number(acceptedStr.replace(/\D/g, "")) || 0;
  const totalReceived = depositToUse + securityToUse + accepted;
  // v0.6.11: вычитаем topup из подсчёта overpay/underpay — пополнение
  // залога это «своя» строка платежа, не относится к закрытию долга.
  // #177: продление (periodTotal) — ЛЕГИТИМНЫЙ сбор, а не переплата. Раньше
  // overpay его не вычитал → для чистого продления (без долга) overpay
  // равнялся periodTotal и тост ложно сообщал «переплата ушла в депозит»
  // (хотя distribute корректно отправлял деньги в rent продления, leftover=0,
  // депозит не менялся). Теперь extension учтён в «сколько нужно собрать»:
  //   • days-режим  → totalReceived = grossTotal → overpay=0 (нет ложного тоста);
  //   • amount-режим → overpay = реальный остаток сверх целых дней (он и правда
  //     уходит в депозит — distribute это делает, тост корректен).
  // extEnabled (= extDays > 0) объявлен ниже — используем extDays напрямую,
  // чтобы не словить «used before declaration».
  const extCharged = extDays > 0 ? periodTotal : 0;
  const overpay = Math.max(0, totalReceived - dueAmount - topupAmount - extCharged);
  const underpay = Math.max(0, dueAmount + topupAmount + extCharged - totalReceived);

  // v0.6.7: extension всегда «включён» когда extDays > 0 — оператор
  // явно выбрал период (через спиннер/preset/amount). Старая логика
  // «extEnabled только при overpay > 0» убрана — она ломала случай
  // когда оператор использует депозит как источник продления.
  const extEnabled = extDays > 0;

  // v0.8.32: amount-mode → days. Полностью переписано. Раньше эта логика
  // считала дни по ТЕКУЩЕЙ ставке тарифа, а отдельный эффект менял тариф
  // по числу дней — два эффекта дрались, итог скакал и попадал на
  // невозможные сочетания (3000 ₽ → тариф «30+ дней» 400 ₽/сут, 7 дней).
  //
  // Теперь один проход:
  //   forExtMoney = max(0, сумма − долг − пополнение залога)
  //   • custom — считаем дни по ставке custom (оператор задал сам);
  //   • tariffPinned — оператор закрепил пресет вручную: дни = floor по
  //     его ставке (даже если выходит за «штатный» диапазон ступени —
  //     это осознанное решение оператора);
  //   • авто — перебираем ступени EXT_TIERS, для каждой считаем дни по её
  //     ставке и оставляем только те, что реально попадают в [min,max]
  //     ступени. Берём вариант с максимумом дней (выгоднее клиенту).
  useEffect(() => {
    if (mode !== "amount") return;
    const amt = Math.max(0, parseInt(amountInput || "0", 10));
    setAcceptedStr(amt > 0 ? String(amt) : "");
    const forExtMoney = Math.max(0, amt - debtPortion - topupAmount);

    if (selectedTariff === "custom") {
      const unitDaily = Math.max(
        1,
        extIsWeekly ? extRate + equipDaily * 7 : dailyExtTotalBase,
      );
      const units = Math.floor(forExtMoney / unitDaily);
      setExtInputOverride(units > 0 ? units : 0);
      return;
    }

    if (tariffPinned) {
      const unitDaily = Math.max(
        1,
        modelRate(selectedTariff) + equipDaily,
      );
      const days = Math.floor(forExtMoney / unitDaily);
      setExtInputOverride(days > 0 ? days : 0);
      return;
    }

    // авто-подбор согласованной ступени
    let bestPeriod: TariffPeriod | null = null;
    let bestDays = 0;
    for (const t of EXT_TIERS) {
      const unitDaily = Math.max(1, modelRate(t.period) + equipDaily);
      const raw = Math.floor(forExtMoney / unitDaily);
      const days = t.max === Infinity ? raw : Math.min(raw, t.max);
      if (days >= t.min && days > bestDays) {
        bestDays = days;
        bestPeriod = t.period;
      }
    }
    if (bestPeriod) {
      setSelectedTariff(bestPeriod);
      setExtInputOverride(bestDays);
    } else {
      setExtInputOverride(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    amountInput,
    mode,
    debtPortion,
    topupAmount,
    tariffPinned,
    selectedTariff,
    extIsWeekly,
    extRate,
    equipDaily,
    dailyExtTotalBase,
    rental.model,
    modelRate,
  ]);

  // v0.6.7: при переключении mode='days' — если override был 0
  // (после amount-вычисления), сразу поставим дефолт 1, чтобы спиннер
  // показал понятное значение. Это не активирует продление само по
  // себе — extEnabled true только когда оператор сознательно жмёт +.
  // Для drag-to-extend (initialExtDays > 0) override уже > 0.
  // НЕ автоматизируем, оставляем 0 для свежего открытия без overdue.

  // v0.9: способ НЕ выбран по умолчанию — оператор обязан осознанно выбрать
  // «Наличные» или «Безнал» (для корректной статистики нал/безнал). payMethod
  // — безопасный резолв для денежной логики (применяется только при accepted>0,
  // где способ гарантированно выбран; fallback при accepted=0 ни на что не влияет).
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const payMethod: PaymentMethod = method ?? "cash";
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const fmt = (n: number) => n.toLocaleString("ru-RU");

  type OpTarget =
    | "overdue_days"
    | "overdue_fine"
    | "damage"
    | "manual"
    | "rent"
    | "swap_fee"
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
  const distribute = (
    acceptedAvail: number = accepted,
    extraDamageSlots: { cap: number; damageReportId: number }[] = [],
  ): Op[] => {
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
    // Этап 2: акт, созданный в этом же сабмите завершения, ещё не попал
    // в debt.damageReports (кэш) — добавляем его слот вручную, чтобы
    // «вносит сейчас» лёг на новый ущерб по приоритету.
    for (const s of extraDamageSlots) {
      if (s.cap > 0)
        queue.push({ cap: s.cap, target: "damage", damageReportId: s.damageReportId });
    }
    queue.push({ cap: manualBalance, target: "manual" });
    // #20-B: доплата за замену — слот перед rent (тот же тир, что аренда).
    queue.push({ cap: pendingSwapFee, target: "swap_fee" });
    queue.push({ cap: pendingRent, target: "rent" });
    // v0.4.49: rent от продления — отдельный target, добавляем в очередь
    // последним перед излишком. Маркер damageReportId=-1 — чтобы submit()
    // понимал что это продление и вызывал extend-inplace вместо обычного
    // payment(rent).
    // Правка 3: бэк extend-inplace создаёт placeholder на
    // (extRate + equipDaily) × extDays = periodTotal. Cap слота должен
    // быть periodTotal (а не чистый extSum), иначе equip-часть
    // placeholder'а останется неоплаченным долгом при PATCH-погашении.
    if (extEnabled && periodTotal > 0) {
      queue.push({ cap: periodTotal, target: "rent", damageReportId: -1 });
    }

    // Шаг 2 — funding-источники в порядке списания: залог аренды (если включён
    // «Из залога») → депозит клиента → принятые деньги. Залог теперь можно
    // направлять на ЛЮБОЙ долг (просрочка/штраф/ущерб/ручной/замена/аренда) —
    // он capнут до paidDebtNow, поэтому в продление не перельётся. Залог и
    // депозит идут method='deposit' (в выручку повторно не падают); удержанный
    // залог проводим доходом отдельно (deposit_forfeit) в submit().
    const ops: Op[] = [];
    const funding: { amount: number; method: PaymentMethod }[] = [
      { amount: securityToUse, method: "deposit" },
      { amount: depositToUse, method: "deposit" },
      { amount: acceptedAvail, method: payMethod },
    ];
    let fundIdx = 0;
    let fundLeft = funding[0]?.amount ?? 0;
    let fundMethod: PaymentMethod = funding[0]?.method ?? payMethod;
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
    // v0.9: способ оплаты обязателен, когда реально принимаем деньги от
    // клиента (accepted>0). Без осознанного выбора нал/безнал не проводим —
    // иначе статистика по способам будет неверной.
    if (accepted > 0 && method === null) {
      toast.error("Выберите способ оплаты", "Наличные или безнал");
      return;
    }
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
      // Этап 2: завершение с ущербом — СНАЧАЛА создаём акт ущерба
      // (зачёт залога внутри), чтобы платёж «вносит сейчас» лёг на него
      // через distribute(). Скутер в ремонт отправляет /complete по
      // scooterNextStatus — не дублируем здесь (sendScooterToRepair=false).
      let completionActId: number | null = null;
      let completionActDebt = 0;
      if (completing && intake.hasDamage) {
        const created = await createDamageReport.mutateAsync({
          rentalId: rental.id,
          items: intake.buildDamageSeedItems(),
          depositCovered: depositZachet,
          note: null,
          sendScooterToRepair: false,
        });
        completionActId = created.id;
        completionActDebt = Math.max(
          0,
          (created.total ?? 0) - (created.depositCovered ?? 0),
        );
        // #28: залить приложенные при приёмке фото/видео ущерба в акт.
        // Медиа опционально — ошибка загрузки не должна валить завершение.
        for (const m of intake.mediaStaged) {
          try {
            await uploadDamageMedia.mutateAsync({
              reportId: created.id,
              file: m.file,
              durationSec: m.durationSec,
            });
          } catch {
            /* не блокируем завершение из-за медиа */
          }
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
      // 2. «Из залога»: удерживаем залог в счёт долга. Эндпоинт уменьшает
      //    rental.deposit, проводит сумму доходом (deposit_forfeit) и пишет
      //    причину в хронологию + заметку. Сам долг гасят payment'ы с
      //    method='deposit' из distribute (ниже) — здесь только источник денег
      //    и единичный учёт выручки (без двойного счёта).
      if (securityToUse > 0) {
        await api.post(`/api/rentals/${rental.id}/deposit/withhold`, {
          amount: securityToUse,
          comment:
            securityComment.trim() ||
            (isPartialDebt
              ? `Погашение долга из залога (${fmt(securityToUse)} из ${fmt(totalDebt)} ₽)`
              : "Погашение долга из залога"),
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
          method: payMethod === "cash" ? "cash" : "transfer",
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
      // v0.8.0: оплата паркинга — отдельным POST ДО distribute (как topup),
      // чтобы эти деньги не ушли в распределение по долгам.
      const parkingPayNow = Math.min(
        parkingDue,
        Math.max(0, accepted - topupAmount),
      );
      if (parkingPayNow > 0) {
        await api.post(`/api/rentals/${rental.id}/parking/pay`, {
          amount: parkingPayNow,
          method: payMethod === "transfer" ? "transfer" : "cash",
        });
      }
      const acceptedForDistribute = Math.max(
        0,
        accepted - topupAmount - parkingPayNow,
      );
      const ops = distribute(
        acceptedForDistribute,
        completionActId
          ? [{ cap: completionActDebt, damageReportId: completionActId }]
          : [],
      );
      // C3: при частичном погашении добавляем в комментарий «X из Y», чтобы в
      // истории было видно «погасил долг … из …».
      const debtNote = isPartialDebt
        ? ` · частичное погашение долга ${fmt(paidDebtNow)} из ${fmt(totalDebt)} ₽`
        : "";
      // Первый проход: всё кроме rent.
      for (const op of ops) {
        if (op.amount <= 0) continue;
        if (op.target === "rent" || op.target === "swap_fee") continue; // отложено (PATCH placeholder ниже)
        if (op.target === "overdue_days") {
          await api.post(`/api/rentals/${rental.id}/debt/payment`, {
            kind: "overdue_days_payment",
            amount: op.amount,
            method: op.method,
            paidAt: paymentTimestamp ?? undefined,
            comment: `Оплата клиента (${methodLabel(op.method)})${debtNote}`,
          });
        } else if (op.target === "overdue_fine") {
          await api.post(`/api/rentals/${rental.id}/debt/payment`, {
            kind: "overdue_fine_payment",
            amount: op.amount,
            method: op.method,
            paidAt: paymentTimestamp ?? undefined,
            comment: `Оплата клиента (${methodLabel(op.method)})${debtNote}`,
          });
        } else if (op.target === "damage") {
          await api.post("/api/payments", {
            rentalId: rental.id,
            type: "damage",
            amount: op.amount,
            method: op.method,
            paid: true,
            paidAt: paymentTimestamp ?? new Date().toISOString(),
            damageReportId: op.damageReportId,
            note: `Оплата по акту${debtNote}`,
          });
        } else if (op.target === "manual") {
          await api.post(`/api/rentals/${rental.id}/debt/payment`, {
            kind: "manual_payment",
            amount: op.amount,
            comment: `Оплата клиента (${methodLabel(op.method)})${debtNote}`,
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
          // #177: экипировка нового периода — бэк посчитает equipDaily × extDays
          // (НЕ остаток текущего периода) и зафиксирует набор как текущую
          // экипировку аренды. periodTotal/«К приёму» уже учитывают её.
          extEquipment,
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
                paidAt: paymentTimestamp ?? new Date().toISOString(),
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
                paidAt: paymentTimestamp ?? new Date().toISOString(),
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
              paidAt: paymentTimestamp ?? new Date().toISOString(),
            });
          }
        }
      }

      // #20-B: проход по swap_fee — гасим существующие placeholder'ы
      // (paid=false, созданы при свапе) PATCH paid=true, FIFO по id. Зеркало
      // прохода по rent. Доплата за замену наконец-то собирается через окно.
      const unpaidSwapFee = (freshPayments.items ?? [])
        .filter(
          (p) => p.rentalId === rental.id && p.type === "swap_fee" && !p.paid,
        )
        .sort((a, b) => a.id - b.id);
      for (const op of ops) {
        if (op.amount <= 0 || op.target !== "swap_fee") continue;
        let amountLeft = op.amount;
        while (amountLeft > 0 && unpaidSwapFee.length > 0) {
          const ph = unpaidSwapFee[0]!;
          if (ph.amount <= amountLeft) {
            await api.patch(`/api/payments/${ph.id}`, {
              paid: true,
              paidAt: paymentTimestamp ?? new Date().toISOString(),
              method: op.method,
            });
            amountLeft -= ph.amount;
            unpaidSwapFee.shift();
          } else {
            await api.patch(`/api/payments/${ph.id}`, {
              amount: ph.amount - amountLeft,
            });
            await api.post("/api/payments", {
              rentalId: rental.id,
              type: "swap_fee",
              amount: amountLeft,
              method: op.method,
              paid: true,
              paidAt: paymentTimestamp ?? new Date().toISOString(),
            });
            ph.amount = ph.amount - amountLeft;
            amountLeft = 0;
          }
        }
        if (amountLeft > 0) {
          await api.post("/api/payments", {
            rentalId: rental.id,
            type: "swap_fee",
            amount: amountLeft,
            method: op.method,
            paid: true,
            paidAt: paymentTimestamp ?? new Date().toISOString(),
          });
        }
      }

      // Этап 2: завершение аренды — ПОСЛЕ всех платежей (акт+погашения
      // уже проведены, остаток ущерба остаётся мягким долгом). Судьбу
      // скутера задаёт scooterNextStatus из приёмки.
      if (completing) {
        const dateActual = intake.dateActualForApi();
        const mileage = intake.mileageForApi();
        const scooterNext = intake.scooterNextStatus;
        if (intake.hasDamage) {
          await completeRentalWithDamage(
            rental.id,
            {
              dateActual,
              conditionOk: false,
              equipmentOk: true,
              // Залог считается «возвращённым» только если зачёта не было.
              depositReturned: depositZachet === 0,
              damageNotes: "",
              mileage,
            },
            0,
            "",
            scooterNext,
          );
        } else {
          await completeRentalNoDamage(
            rental.id,
            {
              dateActual,
              conditionOk: true,
              equipmentOk: true,
              depositReturned: true,
              mileage,
            },
            scooterNext,
          );
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
      // v0.8.0: паркинг (оплата сессий).
      qc.invalidateQueries({ queryKey: ["parking-sessions"] });
      // G2: акты ущерба — баннер «Долг по ущербу» на карточке читает
      // report.debt из этого запроса; без инвалидации он висел устаревшим
      // после оплаты ущерба через единое окно.
      qc.invalidateQueries({ queryKey: ["damage-reports"] });

      if (completing) {
        // Этап 2: завершение. Недосбор (частичная оплата долга) остаётся
        // мягким долгом — клиент уедет в должники/«Висящие долги», ничего
        // не теряется. В режиме завершения это debtRemainAfter (оператор
        // осознанно собрал меньше) либо underpay.
        // Завершение откатываемо (rollback-completion) — тост с «Отменить».
        // rental.status в пропсе ещё «active», поэтому статус для расчёта цели
        // отката передаём явно «completed».
        const doneRef = { id: rental.id, status: "completed" as const };
        const softLeft = Math.max(debtRemainAfter, underpay);
        if (softLeft > 0) {
          toastRentalDone(
            doneRef,
            "Аренда завершена",
            `Принято ${fmt(totalReceived)} ₽. Остаток ${fmt(softLeft)} ₽ — мягкий долг клиента.`,
            { kind: "info" },
          );
        } else if (overpay > 0) {
          toastRentalDone(
            doneRef,
            "Аренда завершена",
            `Переплата ${fmt(overpay)} ₽ ушла в депозит клиента.`,
          );
        } else {
          toastRentalDone(
            doneRef,
            "Аренда завершена",
            intake.hasDamage
              ? "Акт ущерба создан, расчёт проведён."
              : "Расчёт проведён, скутер оформлен.",
          );
        }
      } else if (overpay > 0) {
        toastRentalDone(
          rental,
          "Оплата принята",
          `Переплата ${fmt(overpay)} ₽ ушла в депозит клиента.`,
        );
      } else if (underpay > 0) {
        toastRentalDone(
          rental,
          "Принят частичный платёж",
          `Зачтено ${fmt(totalReceived)} ₽. Остаток ${fmt(underpay)} ₽ висит за клиентом.`,
          { kind: "info" },
        );
      } else {
        // #177: точная формулировка — для чистого продления «переплаты в
        // депозит» нет (см. extCharged выше), не вводим оператора в заблуждение.
        toastRentalDone(
          rental,
          "Оплата принята",
          extCharged > 0
            ? "Продление оформлено, платёж зачтён."
            : "Зачтено в погашение долгов.",
        );
      }

      onPaid?.();
      // v0.9.1: при завершении открываем акт возврата (с позициями ущерба)
      // для печати — оператор отдаёт клиенту. Дровер закроется после
      // закрытия превью. Иначе (обычная оплата) — просто закрываемся.
      if (completing) {
        setActPreviewRentalId(rental.id);
      } else {
        requestClose();
      }
    } catch (e) {
      toast.error("Не удалось принять оплату", (e as Error).message ?? "");
    } finally {
      setSaving(false);
    }
  };

  // «Умное пустое» (мобила): у клиента нет долгов → принимаем как ПРЕДОПЛАТУ —
  // пополняем депозит клиента (его «кошелёк»), не трогая долги/аренду.
  const submitDepositTopup = async () => {
    if (saving || accepted <= 0 || method === null) return;
    setSaving(true);
    try {
      await api.post(`/api/clients/${rental.clientId}/deposit/charge`, {
        amount: accepted,
        comment: `Пополнение депозита (предоплата, ${methodLabel(method)})`,
        rentalId: rental.id,
      });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
      qc.invalidateQueries({ queryKey: ["revenue"] });
      toastRentalDone(
        rental,
        "Депозит пополнен",
        `+${fmt(accepted)} ₽ на депозит клиента.`,
      );
      onPaid?.();
      requestClose();
    } catch (e) {
      toast.error("Не удалось пополнить депозит", (e as Error).message ?? "");
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
    // v0.9.1: продление считается ОТ даты оплаты (якорь), а не от сегодня.
    // По умолчанию paymentDateIso === сегодня → поведение не меняется.
    // При back-date (Панченко: возврат 6-го, сегодня 7-е, оплата 6-го) база
    // продления = 6-е → дни 7,8,9, а не от 7-го. Совпадает с бэкендом:
    // overdue-оплата сдвигает endPlanned на дату оплаты, extend-inplace
    // прибавляет дни уже от неё.
    const pm = /^(\d{4})-(\d{2})-(\d{2})/.exec(paymentDateIso);
    const payDate = pm
      ? new Date(Number(pm[1]), Number(pm[2]) - 1, Number(pm[3]))
      : today;
    payDate.setHours(0, 0, 0, 0);
    const extBase = anchor.getTime() < payDate.getTime() ? payDate : anchor;
    return { startDate, anchor, extBase, today, payDate };
  }, [rental.start, rental.endPlanned, paymentDateIso]);

  const newEnd = useMemo(() => {
    if (!parsedDates) return null;
    if (extDays <= 0) return parsedDates.anchor;
    const d = new Date(parsedDates.extBase);
    d.setDate(d.getDate() + extDays);
    return d;
  }, [parsedDates, extDays]);

  const fmtDDMMYYYY = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;

  // v0.6.12: экипировка inline — управляется EquipmentInlinePicker
  // (общий компонент с MasterBlock). Сама структура хранится в
  // rental.equipmentJson, picker дёргает equipmentChangeAsync который
  // инвалидирует queries → equipmentJson обновится автоматически.
  // Старый EquipmentChangeDialog убран — теперь inline popover.

  // v0.8.32: подсказка прозрачности в режиме «по сумме клиента».
  // extDays и selectedTariff уже согласованы (см. amount-effect выше):
  // выбранное число дней ВСЕГДА полностью покрыто введённой суммой,
  // поэтому «не хватает на выбранные дни» больше не возникает.
  // Единственная полезная подсказка — «докиньте X ₽ → продлите до N дней»
  // (ближайшее число дней, требующее минимальной доплаты; учитывает что
  // на следующей ступени ставка/сут может быть дешевле).
  const forExt = Math.max(0, accepted - debtPortion - topupAmount);
  // Стоимость ровно d дней продления по ставке той ступени, в диапазон
  // которой попадает d (с учётом экипировки/сут).
  const costForExtDays = (d: number): number => {
    const tier =
      EXT_TIERS.find((t) => d >= t.min && d <= t.max) ??
      EXT_TIERS[EXT_TIERS.length - 1];
    return d * (modelRate(tier.period) + equipDaily);
  };
  // Ближайшее число дней > текущего с минимальной доплатой.
  const extUpsell: { days: number; add: number; period: TariffPeriod } | null =
    (() => {
      if (mode !== "amount" || accepted <= 0) return null;
      let best: { days: number; add: number; period: TariffPeriod } | null =
        null;
      for (let d = extDays + 1; d <= extDays + 40; d++) {
        const add = costForExtDays(d) - forExt;
        if (add <= 0) continue;
        if (!best || add < best.add) {
          const tier = EXT_TIERS.find((t) => d >= t.min && d <= t.max)!;
          best = { days: d, add, period: tier.period };
        }
      }
      return best;
    })();

  // #178: остаток суммы сверх целых дней продления (не покрывает ещё день) —
  // показываем оператору, чтобы вернул клиенту (или оставил в депозит).
  const extLeftover =
    mode === "amount" && extDays > 0
      ? Math.max(0, forExt - costForExtDays(extDays))
      : 0;

  // G2: продление доступно только для АКТИВНОЙ аренды. Для завершённой
  // (в т.ч. completed_damage) / отменённой показываем только погашение долга
  // (ущерб/ручной/паркинг) — без блока «период продления» и экипировки.
  const canExtend = rental.status === "active";

  // Сумма «вносит сейчас» (после депозита) — крупное число «К приёму».
  const amountDueNow = Math.max(0, grossTotal - securityToUse - depositToUse);
  // Этап 2: блокировка кнопки. В завершении кнопка активна, даже если
  // денег к приёму нет (чистый возврат), но заблокирована пока не
  // приняты все позиции; способ оплаты обязателен только при accepted>0.
  const submitDisabled =
    saving ||
    (accepted > 0 && method === null) ||
    (completing ? intake.blocked : totalReceived <= 0 && !forgiveDebt);

  const mainPanel = (
      <div
        className={cn(
          "flex h-full flex-col overflow-hidden bg-surface",
          closing && "opacity-0 transition-opacity duration-150",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-3 border-b border-border px-5",
            inline ? "bg-surface py-4" : "bg-gradient-to-r from-blue-50 to-surface py-3",
          )}
        >
          <div
            className={cn(
              "h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0",
              inline && "h-8 w-8",
            )}
          >
            <Repeat size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                "font-bold text-ink",
                inline ? "text-[16px] leading-tight" : "text-[14px]",
              )}
            >
              {completing
                ? `Завершение аренды · #${String(rental.id).padStart(4, "0")}`
                : `Принять платёж · #${String(rental.id).padStart(4, "0")}`}
            </div>
            <div className="mt-1 text-[11.5px] leading-snug text-muted">
              {completing ? (
                <>Примите позиции, проведите расчёт и завершите аренду одним окном.</>
              ) : isOverdueState ? (
                <>
                  Просрочка{" "}
                  <span className="font-semibold text-red-ink tabular-nums">
                    {fmt(overdueDaysBalanceRaw + overdueFineBalanceRaw)} ₽
                    {overdueDaysHeader > 0 ? ` · ${overdueDaysHeader} дн` : ""}
                  </span>
                  {" "}— сначала закрытие долга, затем продление.
                </>
              ) : totalDebt > 0 || unpaidParking > 0 ? (
                // v0.8.29 (H3): есть долг (паркинг/ущерб/неоплачено) — сначала
                // предлагаем погасить, продление — по желанию.
                <>
                  Есть долг{" "}
                  <span className="font-semibold text-red-ink tabular-nums">
                    {fmt(totalDebt + unpaidParking)} ₽
                  </span>{" "}
                  — сначала погасите, при желании продлите.
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
          {/* ─── Этап 2: приёмка позиций (только при завершении) — сверху,
                расчёт ниже. Состояние каждой позиции обязательно. ── */}
          {completing && (
            <div className="border-b border-border px-5 py-4">
              <ReturnIntakeSection intake={intake} />
            </div>
          )}
          {/* ─── Сквозной долг (ущерб с прошлых аренд) — отдельным блоком,
                принимаем оплату прямо тут, не трогая логику текущей аренды ── */}
          {crossDebtTotal > 0 && (
            <div className="border-b border-amber-200 bg-amber-50/70 px-5 py-3.5">
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-[12px] font-bold text-white">
                  !
                </span>
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                  Долг с прошлых аренд
                </div>
                <span className="ml-auto font-display text-[18px] font-extrabold tabular-nums text-amber-900">
                  {fmt(crossDebtTotal)} ₽
                </span>
              </div>
              <div className="mb-2.5 flex flex-col gap-0.5 text-[11.5px] text-amber-900/90">
                {crossSources.map((s) => (
                  <div
                    key={s.rentalId}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {s.label} · {s.scooterName} · аренда #
                      {String(s.rentalId).padStart(4, "0")}
                    </span>
                    <b className="shrink-0 tabular-nums">{fmt(s.amount)} ₽</b>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-amber-800">
                  Принять сейчас
                  <input
                    inputMode="numeric"
                    value={crossPayStr}
                    placeholder={String(crossDebtTotal)}
                    onChange={(e) => setCrossPayStr(e.target.value)}
                    className="w-28 rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-[14px] font-bold tabular-nums text-ink outline-none focus:border-amber-500"
                  />
                </label>
                <div className="flex gap-1">
                  {(
                    [
                      ["cash", "Наличные"],
                      ["transfer", "Перевод"],
                    ] as const
                  ).map(([m, lbl]) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setCrossMethod(m)}
                      className={cn(
                        "rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors",
                        crossMethod === m
                          ? "border-amber-500 bg-amber-100 text-amber-900"
                          : "border-amber-200 bg-white text-ink-2 hover:border-amber-400",
                      )}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handlePayCrossDebt}
                  disabled={crossPayNow <= 0 || payCrossDebt.isPending}
                  className="ml-auto rounded-lg bg-amber-600 px-3 py-2 text-[12px] font-bold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                >
                  {payCrossDebt.isPending
                    ? "Принимаем…"
                    : `Принять ${fmt(crossPayNow)} ₽ по долгу`}
                </button>
              </div>
              {crossPayNow > 0 && crossPayNow < crossDebtTotal && (
                <div className="mt-1.5 text-[10.5px] text-amber-800/80">
                  Частично · останется {fmt(crossDebtTotal - crossPayNow)} ₽ долга
                </div>
              )}
            </div>
          )}
          {/* ─── STEP 1 (если есть просрочка) ─────────────────────────── */}
          {isOverdueState && (
            <div
              className="border-b border-border px-5 py-3.5"
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
              {/* v0.6.52: блок «У клиента залог — закрыть из залога»
                  перенесён в footer (отображается только при завершении
                  аренды, когда extDays === 0). */}
              {/* v0.6.11: 2 карточки grid-cols-2 — «Погасить долг» / «Простить».
                  На «Простить» при hover/click показывается side popover со
                  списком 4 вариантов (все дни / N дней / только штраф / всё). */}
              {/* v0.9: состав долга просрочки — 3 части (аренда / экипировка /
                  штраф), чтобы дни и экипировку не путали в одной сумме. */}
              <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-red-ink">
                <span>
                  Аренда{overdueDaysHeader > 0 ? ` · ${overdueDaysHeader} дн` : ""}:{" "}
                  <b className="tabular-nums">{fmt(overdueRentDaysCharge)} ₽</b>
                </span>
                {overdueEquipCharge > 0 && (
                  <span>
                    Экипировка:{" "}
                    <b className="tabular-nums">{fmt(overdueEquipCharge)} ₽</b>
                  </span>
                )}
                <span>
                  Штраф 50%:{" "}
                  <b className="tabular-nums">{fmt(overdueFineBalanceRaw)} ₽</b>
                </span>
              </div>
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

          {/* ─── STEP 1 (если есть НЕпросроченный долг) ─────────────────
              v0.8.32 (J3b): долг (паркинг/ущерб/ручной/неоплаченная аренда)
              без просрочки — отдельным блоком ВЫШЕ продления, мирроринг
              блока просрочки. Сначала оператор видит что закрыть, продление
              явно опционально (Step 2). */}
          {!isOverdueState && (totalDebt > 0 || unpaidParking > 0) && (
            <div
              className="border-b border-border px-5 py-3.5"
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
                  Сначала — долг
                </div>
                <span
                  className="ml-auto font-display text-[18px] font-extrabold tabular-nums"
                  style={{ color: "hsl(var(--red-ink))" }}
                >
                  {fmt(totalDebt + parkingDue)} ₽
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {pendingRent > 0 && (
                  <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface px-3 py-2 text-[12px]">
                    <span className="font-semibold text-ink">Неоплаченная аренда</span>
                    <span className="font-bold tabular-nums text-ink">{fmt(pendingRent)} ₽</span>
                  </div>
                )}
                {pendingSwapFee > 0 && (
                  <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface px-3 py-2 text-[12px]">
                    <span className="font-semibold text-ink">
                      Доплата за замену скутера
                    </span>
                    <span className="font-bold tabular-nums text-ink">
                      {fmt(pendingSwapFee)} ₽
                    </span>
                  </div>
                )}
                {damageBalance > 0 && (
                  <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface px-3 py-2 text-[12px]">
                    <span className="font-semibold text-ink">Ущерб по акту</span>
                    <span className="font-bold tabular-nums text-ink">{fmt(damageBalance)} ₽</span>
                  </div>
                )}
                {equipmentManualBalance > 0 && (
                  <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface px-3 py-2 text-[12px]">
                    <span className="font-semibold text-ink">За экипировку</span>
                    <span className="font-bold tabular-nums text-ink">{fmt(equipmentManualBalance)} ₽</span>
                  </div>
                )}
                {otherManualBalance > 0 && (
                  <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface px-3 py-2 text-[12px]">
                    <span className="font-semibold text-ink">Ручное начисление</span>
                    <span className="font-bold tabular-nums text-ink">{fmt(otherManualBalance)} ₽</span>
                  </div>
                )}
                {unpaidParking > 0 && (
                  <div className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2">
                    <SquareParking size={16} className="shrink-0 text-blue-600" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold text-ink">
                        Паркинг · {unpaidParkingDays}{" "}
                        {unpaidParkingDays === 1 ? "день" : "дн"}: {fmt(unpaidParking)} ₽
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted">
                        1-е сутки бесплатно, далее 250 ₽/сут.
                      </div>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={payParking}
                        onChange={(e) => setPayParking(e.target.checked)}
                        className="h-3.5 w-3.5 accent-blue-600"
                      />
                      <span className="text-[11px] font-semibold text-ink-2">
                        оплатить
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* R1: тумблер «Продлить аренду» — без него блоки продления скрыты
              (обычная оплата долга), включаем — раскрываются.
              В режиме завершения (completing) продление недоступно — мы
              завершаем аренду, а не продлеваем. */}
          {canExtend && !completing && (
            <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-ink">
                  Продлить аренду
                </div>
                <div className="text-[11px] text-muted">
                  {extendOn
                    ? "выберите срок и условия ниже"
                    : "включите, если клиент продлевает"}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={extendOn}
                onClick={() => setExtendOn((v) => !v)}
                title={extendOn ? "Не продлевать" : "Продлить аренду"}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                  extendOn ? "bg-blue-600" : "bg-border",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                    extendOn ? "translate-x-[22px]" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>
          )}
          {/* G2: блок продления + экипировки — только для активной аренды. */}
          {canExtend && extendOn && (<>
          {/* ─── STEP 2: период продления ─────────────────────────────── */}
          <div className="border-b border-border px-5 py-3.5">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                {isOverdueState || totalDebt > 0 || unpaidParking > 0 ? "2" : "1"}
              </span>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                {totalDebt > 0 || unpaidParking > 0
                  ? "Продление (по желанию)"
                  : "Период продления"}
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
                  onClick={() => {
                    setMode("amount");
                    // v0.8.32: при входе в режим «по сумме» снимаем ручную
                    // фиксацию тарифа, чтобы авто-подбор выбрал согласованную
                    // ступень под введённую сумму.
                    if (selectedTariff !== "custom") setTariffPinned(false);
                  }}
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

            {/* #170: подсказка «применить прошлые условия» — срок/тариф/ставка
                (вкл. «свой») из последних условий аренды. «Да» подставляет их в
                окно продления, «Нет» скрывает. */}
            {!priorHintDismissed && (
              <div className="mb-3 rounded-[10px] border border-blue-100 bg-blue-50/70 px-3 py-2.5">
                <div className="text-[12px] font-bold text-blue-800">
                  Применить прошлые условия?
                </div>
                <div className="mt-0.5 text-[11.5px] text-blue-700/90">
                  ~{priorDays} дн · {TARIFF_PERIOD_LABEL[rental.tariffPeriod]} ·{" "}
                  {rental.rate} ₽/{rental.rateUnit === "week" ? "нед" : "сут"}
                  {rental.customTariff ? " · свой тариф" : ""}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={applyPriorConditions}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3.5 py-1.5 text-[11.5px] font-semibold text-white hover:bg-blue-700"
                  >
                    <Check size={12} /> Да, применить
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriorHintDismissed(true)}
                    className="inline-flex items-center rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold text-muted hover:bg-surface-soft"
                  >
                    Нет
                  </button>
                </div>
              </div>
            )}

            {mode === "days" ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-stretch overflow-hidden rounded-[12px] border border-border">
                  <button
                    type="button"
                    onClick={() => {
                      setOverpayDest("extend");
                      const cur = extInputOverride ?? extInputBase;
                      // v0.6.53: разрешаем 0 дней — оператор хочет только
                      // закрыть долг без продления.
                      setExtInputOverride(Math.max(0, cur - 1));
                    }}
                    className="flex w-10 items-center justify-center bg-surface-soft text-[18px] text-muted hover:text-ink"
                  >
                    −
                  </button>
                  <div className="bg-white px-5 py-2 text-center">
                    {/* v0.6.51: в недельном режиме показываем НЕДЕЛИ (1,2,3…),
                        не дни — цифра 1 = 1 неделя (бэкенд знает ×7). */}
                    <div className="font-display text-[26px] font-extrabold leading-none tabular-nums text-ink">
                      {extInputBase}
                    </div>
                    <div className="text-[10px] text-muted">
                      {extIsWeekly
                        ? extInputBase === 1
                          ? "неделя"
                          : extInputBase < 5
                            ? "недели"
                            : "недель"
                        : extInputBase === 1
                          ? "день"
                          : extInputBase < 5
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
                  {/* v0.6.51: в недельном режиме пресеты — НЕДЕЛИ (1,2,4,8),
                      в дневном — дни (3,7,14,30). n уже в единицах режима. */}
                  {(extIsWeekly ? [0, 1, 2, 4, 8] : [0, 3, 7, 14, 30]).map((n) => {
                    const active = extIsWeekly ? extWeeks === n : extDays === n;
                    const label =
                      n === 0
                        ? "Без продления"
                        : extIsWeekly
                          ? `${n} нед`
                          : `${n}д`;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          setOverpayDest("extend");
                          // n уже в единицах режима (дни/недели) = extInputBase.
                          setExtInputOverride(n);
                          // v0.6.15: при клике на пресет — снимаем pin тарифа
                          // (если не custom), чтобы авто-подбор заработал.
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
                        {label}
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
            {/* v0.8.32: единая подсказка прозрачности в режиме «по сумме
                клиента» — «докиньте X ₽ → продлите до N дней». Строгий
                нейтральный стиль (без жёлтых плашек). */}
            {mode === "amount" && accepted > 0 && extUpsell && (
              <div className="mt-2 rounded-[10px] border border-border bg-surface-soft/50 px-3 py-2 text-[11.5px] font-medium text-ink-2">
                Докиньте{" "}
                <span className="font-bold tabular-nums text-ink">
                  {fmt(extUpsell.add)} ₽
                </span>{" "}
                — {extDays > 0 ? "продлите до" : "хватит на"}{" "}
                <span className="font-bold tabular-nums text-ink">
                  {extUpsell.days}
                </span>{" "}
                {extUpsell.days === 1
                  ? "дня"
                  : extUpsell.days < 5
                    ? "дней"
                    : "дней"}
                {extUpsell.period !== selectedTariff && (
                  <>
                    {" "}
                    (тариф «{TARIFF_PERIOD_LABEL[extUpsell.period]}»{" "}
                    {modelRate(extUpsell.period)} ₽/сут)
                  </>
                )}
                .
              </div>
            )}
            {/* #178: остаток (сдача) сверх целых дней продления — сумма не
                покрывает ещё один день, вернуть клиенту (или в депозит). */}
            {extLeftover > 0 && (
              <div className="mt-2 rounded-[10px] border border-amber-100 bg-amber-50/60 px-3 py-2 text-[11.5px] font-medium text-amber-800">
                Остаток{" "}
                <span className="font-bold tabular-nums">
                  {fmt(extLeftover)} ₽
                </span>{" "}
                не покрывает ещё день — вернуть клиенту (или оставить в депозит).
              </div>
            )}
            {/* v0.6.13: Тариф продления — pills + custom.
                Логика: при выборе пресета пересчитывается extRate из
                TARIFF[model][period]. При custom — поле ставки + toggle
                единиц (₽/сут / ₽/нед). См. блок выше где extRate/
                extDailyRate/extIsWeekly вычисляются из selectedTariff.
                v0.6.12 fix: вертикальный layout, пилюли в flex-wrap чтобы
                нормально жили при 440px ширины. «Свой тариф» отдельной
                строкой под пилюлями. */}
            <div className="mt-2.5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
                  Тариф
                </div>
                <div className="text-[10.5px] text-muted-2 tabular-nums">
                  {extIsWeekly
                    ? `${extRate} ₽/нед · ≈${extDailyRate} ₽/сут`
                    : `${extRate} ₽/сут`}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {/* v0.6.43: порядок по возрастанию срока — 1-2 / 3-6 / 7-29 / 30+ */}
                {(["day", "short", "week", "month"] as const).map((p) => {
                  const r = modelRate(p);
                  // #169: тариф строго по числу дней — тиры НЕ кликабельны.
                  // Активен тот, что соответствует сроку (selectedTariff авто-
                  // подбирается из extDays эффектом ниже); остальные заблокированы
                  // (замок + приглушение). Раньше клик пиннил тариф и прыгало
                  // число дней — отсюда «убегали цифры».
                  const active = selectedTariff === p;
                  return (
                    <div
                      key={p}
                      aria-disabled={!active}
                      className={cn(
                        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors",
                        active
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-transparent bg-surface-soft text-muted-2 opacity-55",
                      )}
                      title={
                        active
                          ? `Тариф по сроку: ${TARIFF_PERIOD_LABEL[p]}`
                          : `${TARIFF_PERIOD_LABEL[p]} — не для текущего срока`
                      }
                    >
                      {active ? (
                        <Check size={11} className="text-blue-600" />
                      ) : (
                        <Lock size={9} className="text-muted-2/60" />
                      )}
                      <span>{TARIFF_PERIOD_LABEL[p]}</span>
                      <span className="tabular-nums">{r} ₽/сут</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
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
                  <span className="text-[11.5px] font-semibold text-ink-2">
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
                          onClick={() => {
                            if (u === extCustomUnit) return;
                            // v0.8.x: при смене единицы СОХРАНЯЕМ число ДНЕЙ
                            // продления, а не число во вводе. Иначе «7 дней»
                            // при переключении на ₽/нед превращалось в «7
                            // недель» (49 дн) — у заказчика «бегали значения».
                            // day→week: дни → недели; week→day: недели → дни.
                            if (u === "week") {
                              setExtInputOverride(
                                Math.max(1, Math.round(extDays / 7)),
                              );
                            } else {
                              setExtInputOverride(Math.max(0, extDays));
                            }
                            setExtCustomUnit(u);
                          }}
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
              </div>
            </div>
          </div>

          {/* ─── STEP 3: экипировка на новый период ─────────────────────
              v0.6.12: тайлы экипировки с hover-overlay «Заменить» +
              inline popover (EquipmentInlinePicker — общий с MasterBlock).
              Старая EquipmentChangeDialog убрана. */}
          <EquipmentStep
            rental={rental}
            equipment={equipment}
            equipDaily={equipDaily}
            hasDebtStep={isOverdueState || totalDebt > 0 || unpaidParking > 0}
            onLocalChange={setExtEquipment}
          />
          </>)}

          {/* «Пополнить залог» убрано из приёма оплаты (нелогично принимать
              долг ОТ клиента и одновременно пополнять залог). Пополнение теперь
              — тап по плашке «Залог» в «Финансовой информации» карточки. */}

          {/* v0.8.32: блок «не хватает на выбранные дни» удалён — в режиме
              «по сумме клиента» число дней теперь всегда полностью покрыто
              суммой (см. amount-effect), недопокрытия не бывает. */}
          {/* v0.6.7: удалены секции (дублирующие новый footer):
              · «Использовать депозит клиента» — checkbox в footer'е
              · «Списать с залога» — функциональность убрана из UI
              · «Принято от клиента, ₽» (mode='days') — авто-расчёт из дней
              · «Способ оплаты» (mode='amount') — pills в footer'е
              · «Переплата · X ₽ — куда направить?» — переплата всегда в продление
              · «Будет проведено» — итог теперь только в footer'е (2-кол) */}
        </div>

        {/* ─── FOOTER v0.6.12 ─── вертикальные блоки:
            (1) итемизация построчно, (2) total «К приёму»,
            (3) способ оплаты + кнопки действия.
            Узкая ширина 440px требует разделения блоков по вертикали —
            раньше итог теснил итемизацию и кнопки сжимались. */}
        <div className="rounded-b-2xl border-t border-border bg-surface-soft pb-6">
          {/* Этап 2: расчёт ущерба по приёмке + зачёт залога (завершение). */}
          {completing && intake.hasDamage && (
            <div className="border-b border-border bg-orange-soft/20 px-5 py-3">
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-orange-ink">
                Ущерб по приёмке
              </div>
              <div className="flex flex-col gap-1 text-[12.5px]">
                {intake.damageLines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-ink-2">
                      {l.label}
                    </span>
                    <b className="shrink-0 tabular-nums text-ink">
                      {fmt(l.amount)} ₽
                    </b>
                  </div>
                ))}
                <div className="mt-0.5 flex items-center justify-between border-t border-orange-200/60 pt-1.5">
                  <span className="font-semibold text-ink">Итого ущерб</span>
                  <b className="tabular-nums text-ink">{fmt(intakeDamageTotal)} ₽</b>
                </div>
                {depositForZachet > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink-2">
                      {returnDepositInstead
                        ? "Залог — клиенту"
                        : "Зачёт залога в ущерб"}
                      <button
                        type="button"
                        onClick={() => setReturnDepositInstead((v) => !v)}
                        className="ml-2 text-[11px] font-semibold text-blue-600 underline"
                      >
                        {returnDepositInstead ? "зачесть в ущерб" : "вернуть залог"}
                      </button>
                    </span>
                    <b
                      className={cn(
                        "shrink-0 tabular-nums",
                        returnDepositInstead ? "text-ink" : "text-green-ink",
                      )}
                    >
                      {returnDepositInstead
                        ? `${fmt(depositForZachet)} ₽`
                        : `−${fmt(depositZachet)} ₽`}
                    </b>
                  </div>
                )}
                <div className="mt-0.5 flex items-center justify-between border-t border-orange-200/60 pt-1.5 text-[13.5px]">
                  <span className="font-bold text-ink">В долг по ущербу</span>
                  <b className="tabular-nums text-orange-ink">
                    {fmt(intakeDamageDebt)} ₽
                  </b>
                </div>
                {!returnDepositInstead && depositReturnToClient > 0 && (
                  <div className="text-[11px] text-muted-2">
                    Остаток залога клиенту:{" "}
                    <b className="text-ink">{fmt(depositReturnToClient)} ₽</b>
                  </div>
                )}
              </div>
            </div>
          )}
          {/* C3: «Клиент вносит по долгу сейчас» — одно поле против ОБЩЕГО
              долга. Пусто = гасим полностью. Можно ввести меньше (частично) —
              остаток просто останется долгом и завтра продолжит расти штатно.
              Сумму раскидывает по составу distribute() по приоритету. */}
          {totalDebt > 0 && (
            <div className="border-b border-border px-5 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-ink">
                  {completing ? "Клиент платит сейчас" : "Клиент вносит по долгу"}
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    inputMode="numeric"
                    // v0.9.1: показываем РЕАЛЬНОЕ чёрное число (не серый
                    // placeholder, который читался как «пусто»). Пусто в
                    // состоянии = «полное закрытие» → выводим totalDebt.
                    value={debtPayStr === "" ? String(paidDebtNow) : debtPayStr}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) =>
                      setDebtPayStr(e.target.value.replace(/\D/g, ""))
                    }
                    className="w-28 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-right text-[14px] font-bold tabular-nums text-ink focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-[12px] text-muted">₽</span>
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-muted">
                  {isPartialDebt ? (
                    <>
                      из {fmt(totalDebt)} ₽ долга
                      <button
                        type="button"
                        onClick={() => setDebtPayStr("")}
                        className="ml-1.5 font-semibold text-blue-600 underline"
                      >
                        полностью
                      </button>
                    </>
                  ) : (
                    "полное закрытие долга"
                  )}
                </span>
                {isPartialDebt && (
                  <span className="font-semibold text-orange-ink">
                    останется долгом {fmt(debtRemainAfter)} ₽
                  </span>
                )}
              </div>
            </div>
          )}
          {/* (1) Итемизация — каждая составляющая на своей строке.
              v0.6.53: цифры крупнее (text-[13.5px] вместо 11.5px). */}
          <div className="flex flex-col gap-2 px-5 py-3 text-[13.5px] font-semibold">
            {(() => {
              // v0.6.12: footer показывает реальные компоненты «К приёму»:
              //   - overdue (post-forgive остаток)
              //   - сколько прощено (если есть)
              //   - damage/manual/pendingRent (как «прочий долг»)
              //   - продление/экипировка
              //   - депозит/topup
              const overdueAfterForgive = overdueDaysBalance + overdueFineBalance;
              const overdueForgiven = overdueBalanceRaw - overdueAfterForgive;
              // v0.9.1: ущерб по приёмке — ОТДЕЛЬНОЙ строкой ниже (не лумпим в
              // «прочий долг», иначе он дублировал блок «Ущерб по приёмке»).
              const otherDebt = pendingRent + damageBalance + manualBalance;
              return (
                <>
                  {/* C3: при частичном погашении показываем ОДНУ строку «гашение
                      долга» (сумма раскидывается по составу по приоритету) +
                      сколько останется. При полном — обычная разбивка. */}
                  {isPartialDebt ? (
                    <>
                      <FooterRow
                        label="Гашение долга (частично)"
                        value={`${fmt(paidDebtNow)} ₽`}
                        tone="red"
                      />
                      <FooterRow
                        label="Останется долга"
                        value={`${fmt(debtRemainAfter)} ₽`}
                      />
                    </>
                  ) : (
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
                      {pendingSwapFee > 0 && (
                        <FooterRow
                          label="Доплата за замену скутера"
                          value={`${fmt(pendingSwapFee)} ₽`}
                        />
                      )}
                      {otherDebt > 0 && (
                        <FooterRow
                          label="Прочий долг (экип./аренда/ущерб/ручной)"
                          value={`${fmt(otherDebt)} ₽`}
                        />
                      )}
                      {completing && intakeDamageDebt > 0 && (
                        <FooterRow
                          label="Ущерб по приёмке (в долг)"
                          value={`${fmt(intakeDamageDebt)} ₽`}
                          tone="red"
                        />
                      )}
                    </>
                  )}
                  {extDays > 0 && (
                    <FooterRow
                      label={
                        extIsWeekly
                          ? `Аренда: ${extWeeks} нед × ${extRate} ₽`
                          : `Аренда: ${extDays} дн × ${extDailyRate} ₽`
                      }
                      value={`${fmt(extSum)} ₽`}
                    />
                  )}
                  {extDays > 0 && equipDaily > 0 && (
                    <FooterRow
                      label={`Экипировка: ${extDays} дн × ${equipDaily} ₽`}
                      value={`${fmt(equipDaily * extDays)} ₽`}
                    />
                  )}
                  {securityToUse > 0 && (
                    <FooterRow
                      label="Из залога"
                      value={`−${fmt(securityToUse)} ₽`}
                      tone="green"
                    />
                  )}
                  {depositToUse > 0 && (
                    <FooterRow
                      label="Списано с депозита"
                      value={`−${fmt(depositToUse)} ₽`}
                      tone="green"
                    />
                  )}
                  {parkingDue > 0 && (
                    <FooterRow
                      label={`Паркинг · ${unpaidParkingDays} ${unpaidParkingDays === 1 ? "день" : "дн"}`}
                      value={`${fmt(parkingDue)} ₽`}
                    />
                  )}
                </>
              );
            })()}
            {/* Источники погашения — крупные тумблеры с полем суммы (а не
                микро-галочки): «Из залога» аренды и «С депозита» клиента. */}
            {canUseSecurity && (
              <div className="mt-2 rounded-[12px] border border-amber-200 bg-amber-50/40 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-semibold text-ink">
                    Гасить из залога
                    <span className="ml-1 text-[11px] font-normal text-muted">
                      доступно {fmt(securityAvailable)} ₽
                    </span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useSecurity}
                    onClick={() => setUseSecurity(!useSecurity)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                      useSecurity ? "bg-amber-500" : "bg-border",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                        useSecurity ? "translate-x-[22px]" : "translate-x-0.5",
                      )}
                    />
                  </button>
                </div>
                {useSecurity && (
                  <div className="mt-2.5 flex flex-col gap-2">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-[11px] text-muted">сумма из залога</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={securityToUseStr}
                        placeholder={String(securityCap)}
                        onChange={(e) =>
                          setSecurityToUseStr(e.target.value.replace(/\D/g, ""))
                        }
                        className="w-28 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-right text-[14px] font-bold tabular-nums text-ink focus:border-amber-500 focus:outline-none"
                      />
                      <span className="text-[12px] font-semibold text-muted">₽</span>
                    </div>
                    <input
                      type="text"
                      value={securityComment}
                      onChange={(e) => setSecurityComment(e.target.value)}
                      placeholder="За что списываем залог (в историю и заметку)"
                      className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11.5px] text-ink outline-none placeholder:text-muted-2 focus:border-amber-400"
                    />
                  </div>
                )}
              </div>
            )}
            {depositBalance > 0 && (
              <div className="mt-2 rounded-[12px] border border-blue-200 bg-blue-50/40 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-semibold text-ink">
                    Списать с депозита
                    <span className="ml-1 text-[11px] font-normal text-muted">
                      доступно {fmt(depositBalance)} ₽
                    </span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useDeposit}
                    onClick={() => setUseDeposit(!useDeposit)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                      useDeposit ? "bg-blue-600" : "bg-border",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                        useDeposit ? "translate-x-[22px]" : "translate-x-0.5",
                      )}
                    />
                  </button>
                </div>
                {useDeposit && (
                  <div className="mt-2.5 flex items-center justify-end gap-2">
                    <span className="text-[11px] text-muted">сумма с депозита</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={depositToUseStr}
                      placeholder={String(depositCap)}
                      onChange={(e) =>
                        setDepositToUseStr(e.target.value.replace(/\D/g, ""))
                      }
                      className="w-28 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-right text-[14px] font-bold tabular-nums text-ink focus:border-blue-500 focus:outline-none"
                    />
                    <span className="text-[12px] font-semibold text-muted">₽</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* v0.8.33 (K1): блок «Закрыть из залога» убран. При продлении
              залог не трогаем — он лежит до завершения аренды. Если нужно
              закрыть аренду и списать с залога — это делается через
              отдельный диалог «Закрыть аренду» (RentalActionDialog).
              PaymentAcceptDialog теперь чисто про долг + продление. */}

          {/* v0.8.32 (J3b): блок паркинга перенесён ВВЕРХ — в блок «Сначала
              — долг» (или в просрочку), выше шага продления. Здесь, в
              футере, паркинг отражается только строкой итемизации. */}

          {/* (2) Итого — крупная сумма «К приёму».
              v0.6.53: text-[28px] font-extrabold — самое важное число
              для оператора, делаем максимально заметным. */}
          <div className="flex items-baseline justify-between border-t border-border px-5 py-4">
            <div className="text-[12px] font-bold uppercase tracking-wider text-muted-2">
              К приёму
            </div>
            <div className="font-display text-[28px] font-extrabold leading-none tabular-nums text-blue-700">
              {fmt(amountDueNow)} ₽
            </div>
          </div>

          {/* (3) Способ оплаты + действия */}
          <div className="flex flex-col gap-2.5 border-t border-border px-5 py-3">
            {/* v0.9: способ оплаты — крупный обязательный выбор. Пока принимаем
                деньги от клиента и способ не выбран, кнопка приёма заблокирована,
                а карточки подсвечены оранжевым «выберите». Это нужно для точной
                статистики нал/безнал. */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
                  Способ оплаты
                </span>
                {accepted > 0 && method === null && (
                  <span className="rounded-full bg-orange-soft px-1.5 py-0.5 text-[10px] font-bold text-orange-ink">
                    выберите
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map((m) => {
                  const active = method === m.id;
                  const needsChoice = accepted > 0 && method === null;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m.id)}
                      className={cn(
                        "flex h-11 items-center justify-center gap-2 rounded-xl border-2 text-[13.5px] font-bold transition-all",
                        active
                          ? "border-blue-600 bg-blue-600 text-white shadow-card-sm"
                          : needsChoice
                            ? "border-orange-ink/45 bg-orange-soft/40 text-ink"
                            : "border-border bg-surface text-muted hover:border-blue-300 hover:text-ink",
                      )}
                    >
                      <m.Icon size={17} />
                      {m.label}
                      {active && <Check size={14} strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={requestClose}
                className="h-12 flex-1 rounded-full border border-border bg-white px-3 text-[14px] font-semibold text-muted-2 hover:bg-surface-soft hover:text-ink-2"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitDisabled}
                className={cn(
                  "inline-flex h-12 flex-[2] items-center justify-center gap-1.5 rounded-full px-4 text-[14px] font-bold text-white",
                  submitDisabled
                    ? "cursor-not-allowed bg-surface text-muted-2"
                    : completing
                      ? "bg-orange hover:bg-orange-ink"
                      : "bg-blue-600 hover:bg-blue-700",
                )}
              >
                <Check size={14} />{" "}
                {completing
                  ? amountDueNow > 0
                    ? `Завершить · принять ${fmt(amountDueNow)} ₽`
                    : "Завершить аренду"
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

  );

  // v0.9.1: шаг «дата поступления оплаты» — показываем перед основным
  // окном, только когда есть просрочка. Дата = ЯКОРЬ отсчёта («как будто
  // сегодня — эта дата»): просрочка и продление считаются от неё. Это НЕ
  // прощение — ничего не пишем в БД на этом шаге; пересчёт только в окне.
  // В режиме завершения дату фиксируем в приёмке («Дата возврата») — не
  // показываем отдельный шаг «когда поступила оплата» (это был бы второй
  // экран, ровно то, от чего уходим). Просрочка считается на сегодня.
  const needDateStep = !completing && hasOverdue && !dateConfirmed;
  // Просрочка НА выбранную дату (сколько дней просрочки на дату оплаты).
  const dateEffDays = effectiveOverdueDaysAsOf(
    rental.endPlanned,
    paymentDateIso,
  );
  // Сколько дней «уходит» из сегодняшней просрочки за счёт back-date
  // (для пояснения оператору; на БД не влияет, если не продлить/закрыть).
  const dateDelayDays = operatorDelayDays(
    debt?.overdueDays ?? 0,
    rental.endPlanned,
    paymentDateIso,
  );
  const dateRemovedAmount = dateDelayDays * (dailyRateBase + fineDailyRate);
  const paymentRu = paymentDateIso.split("-").reverse().join(".");
  const startIso = ruToIsoDate(rental.start);
  const safeCalDate = (iso: string | null): CalendarDate | undefined => {
    if (!iso) return undefined;
    try {
      return parseDate(iso);
    } catch {
      return undefined;
    }
  };
  // Дата — якорь отсчёта, а НЕ прощение: ничего не пишем в БД. Просто
  // фиксируем выбор. Просрочка (overdue*) и база продления (extBase) уже
  // зависят от paymentDateIso и пересчитаются в окне. Если оператор
  // выбрал дату, но не продлил/не закрыл — на БД ничего не меняется,
  // и завтра просрочка снова будет считаться от сегодня (как и должно).
  const confirmDate = () => {
    setDateConfirmed(true);
  };

  const dateStepPanel = (
    <div className="flex h-full flex-col overflow-hidden bg-surface">
      <div className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-blue-50 to-surface px-5 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
          <CalendarIcon size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-ink">
            Когда поступила оплата?
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted">
            #{String(rental.id).padStart(4, "0")} · просрочка считается на эту
            дату
          </div>
        </div>
        <button
          type="button"
          onClick={requestClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-2 hover:bg-border hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        <div className="rounded-[12px] border border-border bg-surface-soft/50 px-3 py-2 text-[12px] text-ink-2">
          Аренда: <b>{rental.start}</b> → <b>{rental.endPlanned}</b>
          {overdueDaysCount > 0 && (
            <>
              {" "}
              · сегодня просрочка{" "}
              <b className="text-red-ink">{overdueDaysCount} дн</b>
            </>
          )}
          <div className="mt-1 text-[11px] text-muted">
            Если клиент заплатил вовремя, а вы фиксируете позже — укажите дату
            оплаты. Отсчёт продления/закрытия пойдёт от неё (как будто сегодня —
            эта дата). Это не прощение долга.
          </div>
        </div>

        <div className="mx-auto w-fit rounded-2xl border border-border bg-surface p-2 [&_table]:w-auto">
          <I18nProvider locale="ru-RU">
            <CalendarPicker
              aria-label="Дата поступления оплаты"
              value={safeCalDate(paymentDateIso)}
              minValue={safeCalDate(startIso)}
              maxValue={safeCalDate(todayIso)}
              onChange={(d) => {
                if (d) {
                  const cd = d as CalendarDate;
                  setPaymentDateIso(
                    `${cd.year}-${String(cd.month).padStart(2, "0")}-${String(cd.day).padStart(2, "0")}`,
                  );
                }
              }}
            />
          </I18nProvider>
        </div>

        {dateEffDays === 0 ? (
          <div className="rounded-[12px] border border-green-ink/30 bg-green-soft/50 px-3 py-2.5 text-[12.5px] text-green-ink">
            Оплата <b>{paymentRu}</b> — в срок, просрочки на эту дату нет
            {dateRemovedAmount > 0 && (
              <> ({fmt(dateRemovedAmount)} ₽ за {dateDelayDays} дн не начисляются)</>
            )}
            . Продление и закрытие пойдут от <b>{paymentRu}</b>.
          </div>
        ) : dateDelayDays > 0 ? (
          <div className="rounded-[12px] border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900">
            На <b>{paymentRu}</b> просрочка <b>{dateEffDays} дн</b> (вместо{" "}
            {overdueDaysCount} сегодня). Отсчёт продления/закрытия — от этой
            даты.
          </div>
        ) : (
          <div className="rounded-[12px] border border-border bg-surface-soft/50 px-3 py-2.5 text-[12.5px] text-ink-2">
            Просрочка <b>{overdueDaysCount} дн</b> начисляется полностью —
            оплата фиксируется сегодня.
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border px-5 py-3">
        <button
          type="button"
          onClick={requestClose}
          className="h-12 flex-1 rounded-full border border-border bg-white px-3 text-[14px] font-semibold text-muted-2 hover:bg-surface-soft hover:text-ink-2"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={confirmDate}
          className="inline-flex h-12 flex-[2] items-center justify-center gap-1.5 rounded-full bg-blue-600 px-4 text-[14px] font-bold text-white hover:bg-blue-700"
        >
          Продолжить
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );

  // v0.9.2: завершение — ДВЕ колонки. Слева приёмка (скроллится), справа
  // расчёт (просрочка + ущерб + оплата) с прибитым низом — деньги и состав
  // долга всегда на виду, не уезжают под приёмку. На узких/мобиле колонки
  // складываются в одну (md:flex-row), расчёт идёт под приёмкой, низ прибит.
  // v0.9.3: производные для «счёта» завершения (двухколоночный макет v3).
  const overduePostForgive = overdueDaysBalance + overdueFineBalance;
  const overdueForgivenAmt = Math.max(0, overdueBalanceRaw - overduePostForgive);
  const forgiveLabel =
    forgiveChoice === "all"
      ? "вся просрочка"
      : forgiveChoice === "days-all"
        ? "все дни"
        : forgiveChoice === "days-n"
          ? `${forgiveDaysN} дн`
          : forgiveChoice === "fine" || forgiveChoice === "fine-n"
            ? "штраф"
            : "";
  const otherExistingDebt = pendingRent + damageBalance + manualBalance;
  const dayForgiveRate =
    overdueDaysCount > 0
      ? Math.round(overdueDaysBalanceRaw / overdueDaysCount)
      : 0;

  const completingPanel = (
    <div
      className={cn(
        // v0.9.4: компактная карточка по ВЫСОТЕ КОНТЕНТА (как в макете) —
        // не на всю высоту вьюпорта. Растёт вниз с числом позиций, до 88vh,
        // дальше тело скроллится. Низ (К приёму/Завершить) всегда прибит.
        "flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card-lg",
        closing && "opacity-0 transition-opacity duration-150",
      )}
    >
      {/* Шапка */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
          <Repeat size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-ink">
            {`Завершение аренды · #${String(rental.id).padStart(4, "0")}`}
          </div>
          <div className="mt-0.5 truncate text-[11.5px] leading-snug text-muted">
            {(rental as { clientName?: string }).clientName
              ? `${(rental as { clientName?: string }).clientName} · `
              : ""}
            {rental.scooter}
          </div>
        </div>
        <button
          type="button"
          onClick={requestClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>

      {/* Тело — две колонки. Скроллится ЦЕЛИКОМ (низ панели прибит ниже),
          колонки равной высоты (счёт «дотягивается» до приёмки). */}
      <div className="flex min-h-0 flex-col overflow-y-auto scrollbar-thin md:flex-row md:items-stretch">
        {/* ЛЕВО — приёмка */}
        <div className="border-b border-border px-4 py-4 md:w-1/2 md:shrink-0 md:border-b-0 md:border-r">
          <ReturnIntakeSection intake={intake} />
        </div>

        {/* ПРАВО — счёт */}
        <div className="flex-1 bg-surface-soft px-4 py-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
            Счёт к закрытию
          </div>

          {/* Сквозной долг с прошлых аренд — отдельный поток оплаты */}
          {crossDebtTotal > 0 && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white">
                  !
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wide text-amber-800">
                  Долг с прошлых аренд
                </span>
                <span className="ml-auto font-display text-[15px] font-extrabold tabular-nums text-amber-900">
                  {fmt(crossDebtTotal)} ₽
                </span>
              </div>
              <div className="mb-2 flex flex-col gap-0.5 text-[11px] text-amber-900/90">
                {crossSources.map((s) => (
                  <div key={s.rentalId} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate">
                      {s.label} · #{String(s.rentalId).padStart(4, "0")}
                    </span>
                    <b className="shrink-0 tabular-nums">{fmt(s.amount)} ₽</b>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  inputMode="numeric"
                  value={crossPayStr}
                  placeholder={String(crossDebtTotal)}
                  onChange={(e) => setCrossPayStr(e.target.value.replace(/\D/g, ""))}
                  className="w-20 rounded-lg border border-amber-300 bg-white px-2 py-1 text-right text-[13px] font-bold tabular-nums text-ink outline-none focus:border-amber-500"
                />
                <span className="text-[11px] text-amber-800">₽</span>
                {(["cash", "transfer"] as const).map((mm) => (
                  <button
                    key={mm}
                    type="button"
                    onClick={() => setCrossMethod(mm)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                      crossMethod === mm
                        ? "border-amber-500 bg-amber-500 text-white"
                        : "border-amber-300 bg-white text-amber-800",
                    )}
                  >
                    {mm === "cash" ? "Наличные" : "Перевод"}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handlePayCrossDebt}
                  disabled={crossPayNow <= 0 || payCrossDebt.isPending}
                  className="ml-auto rounded-full bg-amber-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-40"
                >
                  Принять {fmt(crossPayNow)} ₽
                </button>
              </div>
            </div>
          )}

          {/* Чек этой аренды */}
          {hasOverdue || intake.hasDamage || otherExistingDebt > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              {/* Просрочка + прощение по клику */}
              {hasOverdue && (
                <div className="px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[13px] text-ink">
                      <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-red" />
                      Просрочка{overdueDaysHeader > 0 ? ` · ${overdueDaysHeader} дн` : ""}
                    </span>
                    <span className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setForgiveMenuOpen((o) => !o)}
                        className="inline-flex items-center gap-0.5 text-[11.5px] font-medium text-blue-600 hover:underline"
                      >
                        {forgiveChoice !== "clear" ? "изменить" : "простить"}
                        <ChevronRight
                          size={12}
                          className={cn("transition-transform", forgiveMenuOpen && "rotate-90")}
                        />
                      </button>
                      <b className="text-[13.5px] tabular-nums text-ink">
                        {fmt(overdueBalanceRaw)} ₽
                      </b>
                    </span>
                  </div>
                  {overdueForgivenAmt > 0 && (
                    <div className="mt-1 flex animate-toast-in items-center justify-between text-[12px]">
                      <span className="text-green-ink">прощено: {forgiveLabel}</span>
                      <b className="tabular-nums text-green-ink">
                        −{fmt(overdueForgivenAmt)} ₽
                      </b>
                    </div>
                  )}
                  {forgiveMenuOpen && (
                    <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
                      <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-2">
                        Простить просрочку
                      </div>
                      {[
                        { key: "all", label: "Всё — дни и штраф", amount: overdueBalanceRaw, show: true },
                        { key: "days-all", label: "Только дни (без штрафа)", amount: overdueDaysBalanceRaw, show: hasOverdueDays && hasOverdueFine },
                        { key: "fine", label: "Только штраф 50%", amount: overdueFineBalanceRaw, show: hasOverdueFine },
                      ]
                        .filter((o) => o.show)
                        .map((o) => {
                          const active = forgiveChoice === o.key;
                          return (
                            <button
                              key={o.key}
                              type="button"
                              onClick={() => {
                                setForgiveChoice(o.key as typeof forgiveChoice);
                                setForgiveMenuOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-center justify-between gap-2 border-t border-border px-3 py-2 text-[12.5px]",
                                active ? "bg-blue-soft/60 text-blue-700" : "text-ink-2 hover:bg-surface-soft",
                              )}
                            >
                              <span className="flex items-center gap-2">
                                {active ? (
                                  <CheckCircle2 size={15} className="text-blue-600" />
                                ) : (
                                  <Circle size={15} className="text-muted-2" />
                                )}
                                {o.label}
                              </span>
                              <b className="tabular-nums text-muted">−{fmt(o.amount)} ₽</b>
                            </button>
                          );
                        })}
                      {hasOverdueDays && (
                        <div
                          className={cn(
                            "flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-[12.5px]",
                            forgiveChoice === "days-n" ? "bg-blue-soft/60 text-blue-700" : "text-ink-2",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setForgiveChoice("days-n");
                              setForgiveMenuOpen(false);
                            }}
                            className="flex items-center gap-2"
                          >
                            {forgiveChoice === "days-n" ? (
                              <CheckCircle2 size={15} className="text-blue-600" />
                            ) : (
                              <Circle size={15} className="text-muted-2" />
                            )}
                            N дней
                          </button>
                          <span className="flex items-center gap-2">
                            <span className="flex items-center overflow-hidden rounded-md border border-border">
                              <button
                                type="button"
                                onClick={() => setForgiveDaysN((n) => Math.max(1, n - 1))}
                                className="flex h-6 w-6 items-center justify-center text-muted-2 hover:bg-border"
                              >
                                <Minus size={12} />
                              </button>
                              <span className="w-6 text-center text-[12px] font-semibold tabular-nums">
                                {forgiveDaysN}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setForgiveDaysN((n) => Math.min(overdueDaysCount, n + 1))
                                }
                                className="flex h-6 w-6 items-center justify-center text-muted-2 hover:bg-border"
                              >
                                <Plus size={12} />
                              </button>
                            </span>
                            <b className="w-16 text-right tabular-nums text-muted">
                              −{fmt(forgiveDaysN * dayForgiveRate)} ₽
                            </b>
                          </span>
                        </div>
                      )}
                      {forgiveChoice !== "clear" && (
                        <button
                          type="button"
                          onClick={() => {
                            setClearDebt();
                            setForgiveMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-[12px] text-muted hover:bg-surface-soft"
                        >
                          <X size={14} /> Не прощать
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Ущерб по приёмке — итогом */}
              {intake.hasDamage && (
                <div
                  className={cn(
                    "animate-toast-in px-3.5 py-3",
                    hasOverdue && "border-t border-border",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[13px] text-ink">
                      <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-orange" />
                      Ущерб по приёмке
                    </span>
                    <b className="text-[13.5px] tabular-nums text-ink">
                      {fmt(intakeDamageTotal)} ₽
                    </b>
                  </div>
                  {depositForZachet > 0 && (
                    <div className="mt-1 flex items-center justify-between pl-3.5 text-[12px]">
                      <span className="text-muted">
                        зачёт залога{" "}
                        <button
                          type="button"
                          onClick={() => setReturnDepositInstead((v) => !v)}
                          className="font-medium text-blue-600 underline"
                        >
                          {returnDepositInstead ? "зачесть" : "вернуть"}
                        </button>
                      </span>
                      <b
                        className={cn(
                          "tabular-nums",
                          returnDepositInstead ? "text-ink" : "text-green-ink",
                        )}
                      >
                        {returnDepositInstead
                          ? `${fmt(depositForZachet)} ₽`
                          : `−${fmt(depositZachet)} ₽`}
                      </b>
                    </div>
                  )}
                  {!returnDepositInstead && depositReturnToClient > 0 && (
                    <div className="mt-0.5 pl-3.5 text-[11px] text-muted-2">
                      остаток залога клиенту: {fmt(depositReturnToClient)} ₽
                    </div>
                  )}
                </div>
              )}

              {/* #20-B: доплата за замену — отдельной именованной строкой */}
              {pendingSwapFee > 0 && (
                <div
                  className={cn(
                    "flex items-center justify-between gap-2 px-3.5 py-3 text-[13px] text-ink",
                    (hasOverdue || intake.hasDamage) && "border-t border-border",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-muted-2" />
                    Доплата за замену скутера
                  </span>
                  <b className="text-[13.5px] tabular-nums">{fmt(pendingSwapFee)} ₽</b>
                </div>
              )}
              {/* Прочий долг (аренда/ущерб прошлых актов/ручной) */}
              {otherExistingDebt > 0 && (
                <div
                  className={cn(
                    "flex items-center justify-between gap-2 px-3.5 py-3 text-[13px] text-ink",
                    (hasOverdue || intake.hasDamage || pendingSwapFee > 0) &&
                      "border-t border-border",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-muted-2" />
                    Прочий долг (аренда/ущерб/ручной)
                  </span>
                  <b className="text-[13.5px] tabular-nums">{fmt(otherExistingDebt)} ₽</b>
                </div>
              )}

              {/* Итого долг — receipt-style: пунктирный отрыв «как чек».
                  v0.9.5: цвет суммы как сигнал — алый пока долг есть,
                  эмеральд + чип «закрыт» когда всё погашено/прощено. */}
              <div className="flex items-baseline justify-between border-t border-dashed border-muted-2/40 bg-surface-soft/70 px-3.5 py-3">
                <span className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-muted-2">
                  Итого долг
                  {totalDebt === 0 && (
                    <span className="inline-flex animate-pop-in items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-bold normal-case tracking-normal text-emerald-700">
                      <CheckCircle2 size={10} /> закрыт
                    </span>
                  )}
                </span>
                <span className="flex items-baseline gap-2">
                  {overdueForgivenAmt > 0 && (
                    <span className="text-[12px] text-muted-2 line-through tabular-nums">
                      {fmt(totalDebt + overdueForgivenAmt)}
                    </span>
                  )}
                  <span
                    className={cn(
                      "font-display text-[22px] font-extrabold tabular-nums transition-colors duration-300",
                      totalDebt > 0 ? "text-red-ink" : "text-emerald-600",
                    )}
                  >
                    {fmt(totalDebt)} ₽
                  </span>
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-3.5 py-3 text-[12.5px] text-emerald-700">
              Долгов нет — аренда закроется без оплаты.
            </div>
          )}
        </div>
      </div>

      {/* НИЗ — приём оплаты: «платит сейчас» крупно (именно это число вводим),
          справочно «к оплате», затем способ, затем кнопка. */}
      <div className="shrink-0 border-t border-border bg-surface px-5 py-3.5">
        {totalDebt > 0 && (
          <div className="mb-3 flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
            {/* Главный ввод — сколько клиент вносит сейчас */}
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                  Клиент платит сейчас
                </span>
                <span className="text-[11px] text-muted-2">
                  из {fmt(totalDebt)} ₽ к оплате
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <input
                  inputMode="numeric"
                  value={debtPayStr === "" ? String(paidDebtNow) : debtPayStr}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setDebtPayStr(e.target.value.replace(/\D/g, ""))}
                  className="w-[148px] rounded-xl border-2 border-blue-200 bg-blue-soft/15 px-3 py-1 text-right font-display text-[26px] font-extrabold tabular-nums text-blue-700 outline-none focus:border-blue-500"
                />
                <span className="font-display text-[19px] font-extrabold text-blue-700">
                  ₽
                </span>
              </div>
              <div className="mt-1 text-[11.5px]">
                {isPartialDebt ? (
                  <>
                    <span className="font-semibold text-orange-ink">
                      останется долгом {fmt(debtRemainAfter)} ₽
                    </span>
                    <button
                      type="button"
                      onClick={() => setDebtPayStr("")}
                      className="ml-1.5 font-semibold text-blue-600 underline"
                    >
                      платит всё
                    </button>
                  </>
                ) : (
                  <span className="text-green-ink">полное закрытие долга</span>
                )}
              </div>
            </div>
            {/* Способ оплаты */}
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
                  Способ
                </span>
                {accepted > 0 && method === null && (
                  <span className="rounded-full bg-orange-soft px-1.5 py-0.5 text-[10px] font-bold text-orange-ink">
                    выберите
                  </span>
                )}
              </div>
              <div className="flex overflow-hidden rounded-xl border border-border text-[12.5px]">
                {METHODS.map((m, i) => {
                  const active = method === m.id;
                  const needsChoice = accepted > 0 && method === null;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m.id)}
                      className={cn(
                        "flex items-center gap-1.5 px-3.5 py-2 font-semibold transition-colors",
                        i > 0 && "border-l border-border",
                        active
                          ? "bg-blue-600 text-white"
                          : needsChoice
                            ? "bg-orange-soft/40 text-ink"
                            : "bg-surface text-muted hover:text-ink",
                      )}
                    >
                      <m.Icon size={15} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {/* Кнопка действия */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={requestClose}
            className="h-12 shrink-0 rounded-full border border-border bg-white px-4 text-[13px] font-semibold text-muted-2 hover:bg-surface-soft hover:text-ink-2"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitDisabled}
            className={cn(
              "inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full text-[14.5px] font-bold text-white",
              submitDisabled
                ? "cursor-not-allowed bg-surface text-muted-2"
                : "bg-orange hover:bg-orange-ink",
            )}
          >
            <Check size={16} />{" "}
            {amountDueNow > 0
              ? `Завершить и принять ${fmt(amountDueNow)} ₽`
              : "Завершить аренду"}
          </button>
        </div>
      </div>
    </div>
  );

  const panel = needDateStep
    ? dateStepPanel
    : completing
      ? completingPanel
      : mainPanel;

  // v0.9.1: акт возврата после завершения — печать/скачивание. Закрытие
  // превью закрывает и дровер.
  const actPreview =
    actPreviewRentalId != null
      ? (() => {
          const apiBase = (() => {
            const envBase = import.meta.env.VITE_API_URL as string | undefined;
            if (envBase) return envBase.replace(/\/$/, "");
            return window.location.origin.includes("localhost")
              ? "http://localhost:4000"
              : window.location.origin
                  .replace("crm-preview.", "api-preview.")
                  .replace("crm.", "api.");
          })();
          return (
            <DocumentPreviewModal
              title="Акт возврата"
              htmlUrl={`${apiBase}/api/rentals/${actPreviewRentalId}/document/act_return?format=html`}
              docxUrl={`${apiBase}/api/rentals/${actPreviewRentalId}/document/act_return?format=docx`}
              docxFilename={`act_return_${actPreviewRentalId}.docx`}
              onClose={() => {
                setActPreviewRentalId(null);
                requestClose();
              }}
            />
          );
        })()
      : null;

  // v0.9.4: завершение — компактная карточка по высоте контента, по центру
  // (как в утверждённом макете), а не колонка/драйвер на всю высоту. Растёт
  // вниз с числом позиций; лёгкий бэкдроп (не тёмный) — фон остаётся читаем.
  // ===================== МОБИЛЬНЫЙ МАСТЕР ЗАВЕРШЕНИЯ =====================
  if (completing && isMobile) {
    const cTitles = ["Приёмка", "Счёт", "Оплата"];
    const cAnim = cStepDir === "fwd" ? "animate-wz-fwd" : "animate-wz-back";
    const noDebt = !(
      hasOverdue ||
      intake.hasDamage ||
      otherExistingDebt > 0 ||
      pendingSwapFee > 0
    );
    const forgiveOptions = [
      { key: "all", label: "Всё — дни и штраф", amount: overdueBalanceRaw, show: true },
      {
        key: "days-all",
        label: "Только дни (без штрафа)",
        amount: overdueDaysBalanceRaw,
        show: hasOverdueDays && hasOverdueFine,
      },
      { key: "fine", label: "Только штраф 50%", amount: overdueFineBalanceRaw, show: hasOverdueFine },
    ].filter((o) => o.show);

    return (
      <>
        {actPreview}
        <div className="fixed inset-0 z-[100] flex flex-col bg-surface animate-fade-in">
          {/* HEADER */}
          <div className="flex items-center gap-2 border-b border-border bg-surface-soft px-3 py-2.5">
            <button
              type="button"
              onClick={cStep === 0 ? requestClose : () => goCStep(cStep - 1)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-2 active:bg-border"
            >
              {cStep === 0 ? <X size={18} /> : <ChevronLeft size={20} />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold text-ink">
                Завершение · #{String(rental.id).padStart(4, "0")}
              </div>
              <div className="truncate text-[11px] text-muted-2">
                {rental.scooter}
              </div>
            </div>
            <div className="text-[11px] font-semibold text-muted-2">
              {cStep + 1}/3
            </div>
          </div>
          {/* PROGRESS */}
          <div className="h-1 w-full bg-border">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${((cStep + 1) / 3) * 100}%` }}
            />
          </div>
          <div className="px-4 pb-1 pt-3">
            <div className="text-[12px] font-bold uppercase tracking-wider text-blue-700">
              Шаг {cStep + 1} · {cTitles[cStep]}
            </div>
          </div>

          {/* BODY */}
          <div
            key={cStep}
            className={cn("flex-1 overflow-y-auto px-4 pb-3", cAnim)}
          >
            {/* ----- ШАГ 0: приёмка ----- */}
            {cStep === 0 && <ReturnIntakeSection intake={intake} />}

            {/* ----- ШАГ 1: счёт ----- */}
            {cStep === 1 && (
              <div className="flex flex-col gap-3 pt-1">
                {crossDebtTotal > 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white">
                        !
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-wide text-amber-800">
                        Долг с прошлых аренд
                      </span>
                      <span className="ml-auto font-display text-[15px] font-extrabold tabular-nums text-amber-900">
                        {fmt(crossDebtTotal)} ₽
                      </span>
                    </div>
                    <div className="mb-2 flex flex-col gap-0.5 text-[11.5px] text-amber-900/90">
                      {crossSources.map((s) => (
                        <div
                          key={s.rentalId}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {s.label} · #{String(s.rentalId).padStart(4, "0")}
                          </span>
                          <b className="shrink-0 tabular-nums">{fmt(s.amount)} ₽</b>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input
                        inputMode="numeric"
                        value={crossPayStr}
                        placeholder={String(crossDebtTotal)}
                        onChange={(e) =>
                          setCrossPayStr(e.target.value.replace(/\D/g, ""))
                        }
                        className="w-20 rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-right text-[14px] font-bold tabular-nums text-ink outline-none focus:border-amber-500"
                      />
                      <span className="text-[11px] text-amber-800">₽</span>
                      {(["cash", "transfer"] as const).map((mm) => (
                        <button
                          key={mm}
                          type="button"
                          onClick={() => setCrossMethod(mm)}
                          className={cn(
                            "rounded-full border px-2.5 py-1.5 text-[11px] font-semibold",
                            crossMethod === mm
                              ? "border-amber-500 bg-amber-500 text-white"
                              : "border-amber-300 bg-white text-amber-800",
                          )}
                        >
                          {mm === "cash" ? "Наличные" : "Перевод"}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={handlePayCrossDebt}
                        disabled={crossPayNow <= 0 || payCrossDebt.isPending}
                        className="ml-auto rounded-full bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
                      >
                        Принять {fmt(crossPayNow)} ₽
                      </button>
                    </div>
                  </div>
                )}

                {noDebt ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 px-4 py-5 text-center text-[14px] font-medium text-emerald-700">
                    Долгов нет — аренда закроется без оплаты.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                    {hasOverdue && (
                      <div className="px-3.5 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-[14px] text-ink">
                            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-red" />
                            Просрочка
                            {overdueDaysHeader > 0 ? ` · ${overdueDaysHeader} дн` : ""}
                          </span>
                          <b className="text-[15px] tabular-nums text-ink">
                            {fmt(overdueBalanceRaw)} ₽
                          </b>
                        </div>
                        {overdueForgivenAmt > 0 && (
                          <div className="mt-1 flex animate-toast-in items-center justify-between text-[12.5px]">
                            <span className="text-green-ink">
                              прощено: {forgiveLabel}
                            </span>
                            <b className="tabular-nums text-green-ink">
                              −{fmt(overdueForgivenAmt)} ₽
                            </b>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setForgiveMenuOpen(true)}
                          className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 text-[13px] font-semibold text-blue-700 transition-transform active:scale-[0.99]"
                        >
                          {forgiveChoice !== "clear"
                            ? "Изменить прощение"
                            : "Простить просрочку"}
                        </button>
                      </div>
                    )}
                    {intake.hasDamage && (
                      <div
                        className={cn(
                          "animate-toast-in px-3.5 py-3",
                          hasOverdue && "border-t border-border",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-[14px] text-ink">
                            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-orange" />
                            Ущерб по приёмке
                          </span>
                          <b className="text-[15px] tabular-nums text-ink">
                            {fmt(intakeDamageTotal)} ₽
                          </b>
                        </div>
                        {depositForZachet > 0 && (
                          <div className="mt-1.5 flex items-center justify-between pl-3.5 text-[12.5px]">
                            <span className="text-muted">
                              зачёт залога{" "}
                              <button
                                type="button"
                                onClick={() =>
                                  setReturnDepositInstead((v) => !v)
                                }
                                className="font-medium text-blue-600 underline"
                              >
                                {returnDepositInstead ? "зачесть" : "вернуть"}
                              </button>
                            </span>
                            <b
                              className={cn(
                                "tabular-nums",
                                returnDepositInstead
                                  ? "text-ink"
                                  : "text-green-ink",
                              )}
                            >
                              {returnDepositInstead
                                ? `${fmt(depositForZachet)} ₽`
                                : `−${fmt(depositZachet)} ₽`}
                            </b>
                          </div>
                        )}
                        {!returnDepositInstead && depositReturnToClient > 0 && (
                          <div className="mt-0.5 pl-3.5 text-[11.5px] text-muted-2">
                            остаток залога клиенту: {fmt(depositReturnToClient)} ₽
                          </div>
                        )}
                      </div>
                    )}
                    {pendingSwapFee > 0 && (
                      <div
                        className={cn(
                          "flex items-center justify-between gap-2 px-3.5 py-3 text-[14px] text-ink",
                          (hasOverdue || intake.hasDamage) &&
                            "border-t border-border",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-muted-2" />
                          Доплата за замену скутера
                        </span>
                        <b className="text-[15px] tabular-nums">
                          {fmt(pendingSwapFee)} ₽
                        </b>
                      </div>
                    )}
                    {otherExistingDebt > 0 && (
                      <div
                        className={cn(
                          "flex items-center justify-between gap-2 px-3.5 py-3 text-[14px] text-ink",
                          (hasOverdue || intake.hasDamage || pendingSwapFee > 0) &&
                            "border-t border-border",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-muted-2" />
                          Прочий долг (аренда/ущерб/ручной)
                        </span>
                        <b className="text-[15px] tabular-nums">
                          {fmt(otherExistingDebt)} ₽
                        </b>
                      </div>
                    )}
                    <div className="flex items-baseline justify-between border-t border-dashed border-muted-2/40 bg-surface-soft/70 px-3.5 py-3">
                      <span className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-muted-2">
                        Итого долг
                        {totalDebt === 0 && (
                          <span className="inline-flex animate-pop-in items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-bold normal-case tracking-normal text-emerald-700">
                            <CheckCircle2 size={10} /> закрыт
                          </span>
                        )}
                      </span>
                      <span className="flex items-baseline gap-2">
                        {overdueForgivenAmt > 0 && (
                          <span className="text-[12px] text-muted-2 line-through tabular-nums">
                            {fmt(totalDebt + overdueForgivenAmt)}
                          </span>
                        )}
                        <span
                          className={cn(
                            "font-display text-[22px] font-extrabold tabular-nums transition-colors duration-300",
                            totalDebt > 0 ? "text-red-ink" : "text-emerald-600",
                          )}
                        >
                          {fmt(totalDebt)} ₽
                        </span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ----- ШАГ 2: оплата ----- */}
            {cStep === 2 && (
              <div className="flex flex-col gap-3 pt-1">
                {totalDebt > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setPayNumpadOpen(true)}
                      className="rounded-2xl border-2 border-blue-200 bg-blue-soft/15 p-4 text-left transition-colors active:border-blue-400"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-bold uppercase tracking-wider text-muted-2">
                          Клиент платит сейчас
                        </span>
                        <Pencil size={14} className="text-blue-600" />
                      </div>
                      <div className="mt-1 font-display text-[34px] font-extrabold leading-tight tabular-nums text-blue-700">
                        {fmt(paidDebtNow)}{" "}
                        <span className="text-[22px]">₽</span>
                      </div>
                      <div className="mt-0.5 text-[12px] text-muted-2">
                        из {fmt(totalDebt)} ₽ к оплате
                      </div>
                    </button>
                    <div className="text-[12.5px]">
                      {isPartialDebt ? (
                        <span className="font-semibold text-orange-ink">
                          останется долгом {fmt(debtRemainAfter)} ₽
                          <button
                            type="button"
                            onClick={() => setDebtPayStr("")}
                            className="ml-1.5 font-semibold text-blue-600 underline"
                          >
                            платит всё
                          </button>
                        </span>
                      ) : (
                        <span className="text-green-ink">
                          полное закрытие долга
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                          Способ оплаты
                        </span>
                        {accepted > 0 && method === null && (
                          <span className="rounded-full bg-orange-soft px-1.5 py-0.5 text-[10px] font-bold text-orange-ink">
                            выберите
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {METHODS.map((m) => {
                          const active = method === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setMethod(m.id)}
                              className={cn(
                                "flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border text-[14px] font-semibold transition-colors",
                                active
                                  ? "border-blue-600 bg-blue-600 text-white"
                                  : "border-border bg-surface text-ink-2",
                              )}
                            >
                              <m.Icon size={16} /> {m.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 px-4 py-5 text-center text-[14px] font-medium text-emerald-700">
                    Долгов нет — аренда закроется без оплаты.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* FOOTER */}
          <div className="border-t border-border bg-surface px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            <div className="flex gap-2">
              {cStep > 0 && (
                <button
                  type="button"
                  onClick={() => goCStep(cStep - 1)}
                  className="h-12 flex-1 rounded-2xl bg-surface-soft text-[15px] font-semibold text-ink-2 transition-transform active:scale-[0.98]"
                >
                  Назад
                </button>
              )}
              {cStep < 2 ? (
                <button
                  type="button"
                  onClick={() => goCStep(cStep + 1)}
                  disabled={cStep === 0 && intake.blocked}
                  className="h-12 flex-[2] rounded-2xl bg-blue-600 text-[15px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
                >
                  Далее
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitDisabled}
                  className={cn(
                    "inline-flex h-12 flex-[2] items-center justify-center gap-1.5 rounded-2xl text-[15px] font-bold text-white transition-transform active:scale-[0.98]",
                    submitDisabled
                      ? "bg-surface-soft text-muted-2"
                      : "bg-orange",
                  )}
                >
                  <Check size={16} />{" "}
                  {amountDueNow > 0
                    ? `Завершить · ${fmt(amountDueNow)} ₽`
                    : "Завершить аренду"}
                </button>
              )}
            </div>
          </div>

          {/* Нижний лист «простить просрочку» */}
          {forgiveMenuOpen && hasOverdue && (
            <div
              className="fixed inset-0 z-[140] flex flex-col justify-end bg-ink/45 backdrop-blur-sm animate-fade-in"
              onClick={() => setForgiveMenuOpen(false)}
            >
              <div
                className="rounded-t-3xl bg-surface pb-[max(env(safe-area-inset-bottom),1rem)] shadow-card-lg animate-sheet-up"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-center pb-1 pt-2.5">
                  <div className="h-1.5 w-10 rounded-full bg-muted-2/40" />
                </div>
                <div className="px-5 pt-1 text-center text-[15px] font-semibold text-ink">
                  Простить просрочку
                </div>
                <div className="px-5 pb-3 text-center text-[12px] text-muted-2">
                  Просрочка
                  {overdueDaysHeader > 0 ? ` · ${overdueDaysHeader} дн` : ""} ·{" "}
                  {fmt(overdueBalanceRaw)} ₽
                </div>
                <div className="px-4">
                  {forgiveOptions.map((o) => {
                    const active = forgiveChoice === o.key;
                    return (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() =>
                          setForgiveChoice(o.key as typeof forgiveChoice)
                        }
                        className={cn(
                          "mb-2 flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-[14px] transition-colors",
                          active
                            ? "border-blue-500 bg-blue-soft/40 text-blue-700"
                            : "border-border bg-surface text-ink",
                        )}
                      >
                        {active ? (
                          <CheckCircle2 size={18} className="text-blue-600" />
                        ) : (
                          <Circle size={18} className="text-muted-2" />
                        )}
                        <span className="flex-1 text-left">{o.label}</span>
                        <b className="tabular-nums text-muted">
                          −{fmt(o.amount)} ₽
                        </b>
                      </button>
                    );
                  })}
                  {hasOverdueDays && (
                    <div
                      className={cn(
                        "mb-2 flex items-center gap-3 rounded-2xl border px-4 py-3 text-[14px] transition-colors",
                        forgiveChoice === "days-n"
                          ? "border-blue-500 bg-blue-soft/40 text-blue-700"
                          : "border-border bg-surface text-ink",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setForgiveChoice("days-n")}
                        className="flex items-center gap-3"
                      >
                        {forgiveChoice === "days-n" ? (
                          <CheckCircle2 size={18} className="text-blue-600" />
                        ) : (
                          <Circle size={18} className="text-muted-2" />
                        )}
                        <span>N дней</span>
                      </button>
                      <span className="ml-auto flex items-center gap-2">
                        <span className="flex items-center overflow-hidden rounded-lg border border-border">
                          <button
                            type="button"
                            onClick={() =>
                              setForgiveDaysN((n) => Math.max(1, n - 1))
                            }
                            className="flex h-8 w-8 items-center justify-center text-muted-2 active:bg-border"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-8 text-center text-[14px] font-semibold tabular-nums">
                            {forgiveDaysN}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setForgiveDaysN((n) =>
                                Math.min(overdueDaysCount, n + 1),
                              )
                            }
                            className="flex h-8 w-8 items-center justify-center text-muted-2 active:bg-border"
                          >
                            <Plus size={14} />
                          </button>
                        </span>
                        <b className="w-16 text-right tabular-nums text-muted">
                          −{fmt(forgiveDaysN * dayForgiveRate)} ₽
                        </b>
                      </span>
                    </div>
                  )}
                  {forgiveChoice !== "clear" && (
                    <button
                      type="button"
                      onClick={() => setClearDebt()}
                      className="mb-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface-soft px-4 py-2.5 text-[13px] font-semibold text-muted-2"
                    >
                      <X size={15} /> Не прощать
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setForgiveMenuOpen(false)}
                    className="mb-1 h-12 w-full rounded-2xl bg-blue-600 text-[15px] font-bold text-white transition-transform active:scale-[0.98]"
                  >
                    Готово
                  </button>
                </div>
              </div>
            </div>
          )}

          {payNumpadOpen && (
            <MobileNumPad
              label="Клиент платит сейчас"
              hint={`из ${fmt(totalDebt)} ₽ к оплате`}
              initial={paidDebtNow}
              max={totalDebt}
              onCancel={() => setPayNumpadOpen(false)}
              onConfirm={(n) => {
                setDebtPayStr(String(n));
                setPayNumpadOpen(false);
              }}
            />
          )}
        </div>
        <ReturnDamagePicker intake={intake} />
      </>
    );
  }

  // ── Мобильный мастер «Принять платёж» (mid-rental, без завершения) ──
  // На мобиле — ТОТ ЖЕ функционал, что на десктопе, просто разбит на экраны:
  // Долг → Продление → Оплата. Вся логика/сабмит общие (тот же extendOn,
  // extendInplaceAsync, distribute, источники) — отличается только вёрстка.
  if (isMobile) {
    const pTitles = ["Долг", "Продление", "Оплата"];
    const stepCount = pTitles.length;
    const pAnim = payStepDir === "fwd" ? "animate-wz-fwd" : "animate-wz-back";
    const forgiveOptions = [
      { key: "all", label: "Всё — дни и штраф", amount: overdueBalanceRaw, show: true },
      {
        key: "days-all",
        label: "Только дни (без штрафа)",
        amount: overdueDaysBalanceRaw,
        show: hasOverdueDays && hasOverdueFine,
      },
      {
        key: "fine",
        label: "Только штраф 50%",
        amount: overdueFineBalanceRaw,
        show: hasOverdueFine,
      },
    ].filter((o) => o.show);
    const totalDue = totalDebt + parkingDue;
    const noDebt = totalDue <= 0;
    // Предоплата = нет долга И не продлеваем (клиент просто кладёт на депозит).
    const isPrepay = noDebt && periodTotal <= 0;
    // Всё к сбору = долг(+паркинг) + продление; наличные = это минус источники.
    const cashMax = Math.max(0, grossTotal - securityToUse - depositToUse);
    // Сколько всего закрываем сейчас и сколько останется (долг/недобор продления).
    const coveredNow = Math.min(grossTotal, securityToUse + depositToUse + accepted);
    const remainDebt = Math.max(0, grossTotal - coveredNow);
    const padCfg =
      payPad === "cash"
        ? isPrepay
          ? { label: "Сумма депозита", hint: "предоплата клиента", initial: accepted, max: undefined as number | undefined }
          : { label: "Клиент вносит", hint: `остаток ${fmt(cashMax)} ₽`, initial: accepted, max: cashMax as number | undefined }
        : payPad === "security"
          ? { label: "Сумма из залога", hint: `доступно ${fmt(securityAvailable)} ₽`, initial: securityToUse, max: securityCap as number | undefined }
          : { label: "Сумма с депозита", hint: `доступно ${fmt(depositBalance)} ₽`, initial: depositToUse, max: depositCap as number | undefined };
    return (
      <>
        {actPreview}
        <div className="fixed inset-0 z-[100] flex flex-col bg-surface animate-fade-in">
          {/* HEADER */}
          <div className="flex items-center gap-2 border-b border-border bg-surface-soft px-3 py-2.5">
            <button
              type="button"
              onClick={payStep === 0 ? requestClose : () => goPayStep(payStep - 1)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-2 active:bg-border"
            >
              {payStep === 0 ? <X size={18} /> : <ChevronLeft size={20} />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold text-ink">
                Принять платёж · #{String(rental.id).padStart(4, "0")}
              </div>
              <div className="truncate text-[11px] text-muted-2">{rental.scooter}</div>
            </div>
            <div className="text-[11px] font-semibold text-muted-2">
              {payStep + 1}/{stepCount}
            </div>
          </div>
          {/* PROGRESS */}
          <div className="h-1 w-full bg-border">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${((payStep + 1) / stepCount) * 100}%` }}
            />
          </div>
          <div className="px-4 pb-1 pt-3">
            <div className="text-[12px] font-bold uppercase tracking-wider text-blue-700">
              Шаг {payStep + 1} · {pTitles[payStep]}
            </div>
          </div>

          {/* BODY */}
          <div key={payStep} className={cn("flex-1 overflow-y-auto px-4 pb-3", pAnim)}>
            {/* ----- ШАГ 0: ДОЛГ ----- */}
            {payStep === 0 && (
              <div className="flex flex-col gap-3 pt-1">
                {noDebt ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 px-4 py-5 text-center">
                    <div className="text-[14px] font-semibold text-emerald-700">
                      У клиента нет долгов
                    </div>
                    <div className="mt-0.5 text-[12px] text-emerald-700/80">
                      Дальше можно продлить аренду; а если клиент просто вносит
                      деньги — на шаге «Оплата» примите их как предоплату (депозит).
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                      {hasOverdue && (
                        <div className="px-3.5 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-[14px] text-ink">
                              <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-red" />
                              Просрочка{overdueDaysHeader > 0 ? ` · ${overdueDaysHeader} дн` : ""}
                            </span>
                            <b className="text-[15px] tabular-nums text-ink">
                              {fmt(overdueBalanceRaw)} ₽
                            </b>
                          </div>
                          {overdueForgivenAmt > 0 && (
                            <div className="mt-1 flex items-center justify-between text-[12.5px]">
                              <span className="text-green-ink">прощено: {forgiveLabel}</span>
                              <b className="tabular-nums text-green-ink">−{fmt(overdueForgivenAmt)} ₽</b>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => setForgiveMenuOpen(true)}
                            className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 text-[13px] font-semibold text-blue-700 transition-transform active:scale-[0.99]"
                          >
                            {forgiveChoice !== "clear" ? "Изменить прощение" : "Простить просрочку"}
                          </button>
                        </div>
                      )}
                      {otherExistingDebt > 0 && (
                        <div className={cn("flex items-center justify-between gap-2 px-3.5 py-3 text-[14px] text-ink", hasOverdue && "border-t border-border")}>
                          <span className="flex items-center gap-2">
                            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-muted-2" />
                            Прочий долг (аренда/ущерб/ручной)
                          </span>
                          <b className="text-[15px] tabular-nums">{fmt(otherExistingDebt)} ₽</b>
                        </div>
                      )}
                      {pendingSwapFee > 0 && (
                        <div className={cn("flex items-center justify-between gap-2 px-3.5 py-3 text-[14px] text-ink", (hasOverdue || otherExistingDebt > 0) && "border-t border-border")}>
                          <span className="flex items-center gap-2">
                            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-muted-2" />
                            Доплата за замену
                          </span>
                          <b className="text-[15px] tabular-nums">{fmt(pendingSwapFee)} ₽</b>
                        </div>
                      )}
                      {parkingDue > 0 && (
                        <div className={cn("flex items-center justify-between gap-2 px-3.5 py-3 text-[14px] text-ink", (hasOverdue || otherExistingDebt > 0 || pendingSwapFee > 0) && "border-t border-border")}>
                          <span className="flex items-center gap-2">
                            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-muted-2" />
                            Паркинг{unpaidParkingDays > 0 ? ` · ${unpaidParkingDays} дн` : ""}
                          </span>
                          <b className="text-[15px] tabular-nums">{fmt(parkingDue)} ₽</b>
                        </div>
                      )}
                      <div className="flex items-baseline justify-between border-t border-dashed border-muted-2/40 bg-surface-soft/70 px-3.5 py-3">
                        <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted-2">Итого долг</span>
                        <span className="font-display text-[22px] font-extrabold tabular-nums text-red-ink">{fmt(totalDue)} ₽</span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-blue-100 bg-blue-50/30 px-4 py-3 text-center text-[12.5px] text-blue-800">
                      Дальше выберите, чем закрываем: залог, депозит, наличные —
                      и сколько вносит клиент.
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ----- ШАГ 1: ПРОДЛЕНИЕ (та же логика, что на десктопе) ----- */}
            {payStep === 1 && (
              <div className="flex flex-col gap-3 pt-1">
                {!canExtend ? (
                  <div className="rounded-2xl border border-border bg-surface-soft px-4 py-6 text-center text-[13px] text-muted-2">
                    Продление недоступно для этой аренды.
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-surface p-3.5">
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-ink">Продлить аренду</div>
                        <div className="text-[11.5px] text-muted">
                          {extendOn ? "выберите срок и тариф" : "включите, если клиент продлевает"}
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={extendOn}
                        onClick={() => setExtendOn((v) => !v)}
                        className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors", extendOn ? "bg-blue-600" : "bg-border")}
                      >
                        <span className={cn("inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform", extendOn ? "translate-x-[22px]" : "translate-x-0.5")} />
                      </button>
                    </div>

                    {extendOn && (
                      <>
                        {!priorHintDismissed && (
                          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-3.5 py-3">
                            <div className="text-[12.5px] font-bold text-blue-800">Применить прошлые условия?</div>
                            <div className="mt-0.5 text-[11.5px] text-blue-700/90">
                              ~{priorDays} дн · {TARIFF_PERIOD_LABEL[rental.tariffPeriod]} · {rental.rate} ₽/{rental.rateUnit === "week" ? "нед" : "сут"}{rental.customTariff ? " · свой" : ""}
                            </div>
                            <div className="mt-2 flex gap-2">
                              <button type="button" onClick={applyPriorConditions} className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3.5 py-1.5 text-[12px] font-semibold text-white">
                                <Check size={12} /> Да, применить
                              </button>
                              <button type="button" onClick={() => setPriorHintDismissed(true)} className="inline-flex items-center rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-muted">Нет</button>
                            </div>
                          </div>
                        )}

                        <div className="rounded-2xl border border-border bg-surface p-3.5">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">На сколько {extIsWeekly ? "недель" : "дней"}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <button type="button" onClick={() => { setOverpayDest("extend"); setExtInputOverride(Math.max(0, (extInputOverride ?? extInputBase) - 1)); }} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-soft text-[24px] text-muted-2 active:bg-border">−</button>
                            <div className="flex-1 text-center">
                              <div className="font-display text-[34px] font-extrabold leading-none tabular-nums text-ink">{extInputBase}</div>
                              <div className="text-[11px] text-muted">{extIsWeekly ? (extInputBase === 1 ? "неделя" : "недель") : (extInputBase === 1 ? "день" : "дней")}</div>
                            </div>
                            <button type="button" onClick={() => { setOverpayDest("extend"); setExtInputOverride((extInputOverride ?? extInputBase) + 1); }} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-[24px] text-white active:bg-blue-700">+</button>
                          </div>
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {(extIsWeekly ? [0, 1, 2, 4, 8] : [0, 3, 7, 14, 30]).map((n) => {
                              const active = extIsWeekly ? extWeeks === n : extDays === n;
                              return (
                                <button key={n} type="button" onClick={() => { setOverpayDest("extend"); setExtInputOverride(n); if (selectedTariff !== "custom") setTariffPinned(false); }} className={cn("rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors", active ? "border-blue-200 bg-blue-50 text-blue-700" : "border-border text-muted")}>
                                  {n === 0 ? "Без продл." : extIsWeekly ? `${n} нед` : `${n}д`}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-border bg-surface p-3.5">
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">Тариф (по сроку)</span>
                            <span className="text-[11px] text-muted-2 tabular-nums">{extIsWeekly ? `${extRate} ₽/нед · ≈${extDailyRate} ₽/сут` : `${extRate} ₽/сут`}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {(["day", "short", "week", "month"] as const).map((p) => {
                              const active = selectedTariff === p;
                              return (
                                <div key={p} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold", active ? "border-blue-600 bg-blue-50 text-blue-700" : "border-transparent bg-surface-soft text-muted-2 opacity-55")}>
                                  {active ? <Check size={11} className="text-blue-600" /> : <Lock size={9} className="text-muted-2/60" />}
                                  {TARIFF_PERIOD_LABEL[p]} · {modelRate(p)}
                                </div>
                              );
                            })}
                          </div>
                          <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5">
                            <input type="checkbox" checked={selectedTariff === "custom"} onChange={(e) => { setSelectedTariff(e.target.checked ? "custom" : initialTariff); setTariffPinned(e.target.checked); }} className="h-3.5 w-3.5 accent-blue-600" />
                            <span className="text-[12px] font-semibold text-ink-2">Свой тариф</span>
                          </label>
                          {selectedTariff === "custom" && (
                            <input type="text" inputMode="numeric" value={extCustomRate || ""} onChange={(e) => setExtCustomRate(Math.max(0, parseInt(e.target.value.replace(/\D/g, "") || "0", 10)))} placeholder="3000 (₽/сут)" className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[14px] font-bold tabular-nums text-ink outline-none focus:border-blue-500" />
                          )}
                        </div>

                        <EquipmentStep rental={rental} equipment={equipment} equipDaily={equipDaily} hasDebtStep={false} onLocalChange={setExtEquipment} />

                        <div className="flex items-center justify-between rounded-2xl bg-surface-soft px-4 py-3">
                          <div>
                            <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">Новый возврат</div>
                            <div className="font-display text-[18px] font-extrabold tabular-nums text-blue-700">{newEnd && extDays > 0 ? fmtDDMMYYYY(newEnd) : "—"}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">За продление</div>
                            <div className="font-display text-[18px] font-extrabold tabular-nums text-ink">{fmt(periodTotal)} ₽</div>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ----- ШАГ 2: ОПЛАТА ----- */}
            {payStep === 2 && (
              <div className="flex flex-col gap-3 pt-1">
                {isPrepay ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 px-4 py-5 text-center text-[13px] text-emerald-700">
                    Долгов и продления нет — принимаем как <b>предоплату</b>:
                    сумма ниже пойдёт на депозит клиента.
                  </div>
                ) : (
                  <>
                {canUseSecurity && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-ink">
                        Гасить из залога
                        <span className="ml-1 text-[11px] font-normal text-muted">доступно {fmt(securityAvailable)} ₽</span>
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={useSecurity}
                        onClick={() => {
                          setUseSecurity(!useSecurity);
                          setCashTouched(false);
                        }}
                        className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors", useSecurity ? "bg-amber-500" : "bg-border")}
                      >
                        <span className={cn("inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform", useSecurity ? "translate-x-[22px]" : "translate-x-0.5")} />
                      </button>
                    </div>
                    {useSecurity && (
                      <div className="mt-2.5 flex flex-col gap-2">
                        <button type="button" onClick={() => setPayPad("security")} className="flex items-center justify-between rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-left">
                          <span className="text-[12px] text-muted">сумма из залога</span>
                          <span className="font-display text-[18px] font-extrabold tabular-nums text-ink">{fmt(securityToUse)} ₽</span>
                        </button>
                        <input
                          type="text"
                          value={securityComment}
                          onChange={(e) => setSecurityComment(e.target.value)}
                          placeholder="За что (в историю и заметку)"
                          className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[13px] text-ink outline-none placeholder:text-muted-2 focus:border-amber-400"
                        />
                      </div>
                    )}
                  </div>
                )}
                {depositBalance > 0 && (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-ink">
                        Списать с депозита
                        <span className="ml-1 text-[11px] font-normal text-muted">доступно {fmt(depositBalance)} ₽</span>
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={useDeposit}
                        onClick={() => {
                          setUseDeposit(!useDeposit);
                          setCashTouched(false);
                        }}
                        className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors", useDeposit ? "bg-blue-600" : "bg-border")}
                      >
                        <span className={cn("inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform", useDeposit ? "translate-x-[22px]" : "translate-x-0.5")} />
                      </button>
                    </div>
                    {useDeposit && (
                      <button type="button" onClick={() => setPayPad("deposit")} className="mt-2.5 flex w-full items-center justify-between rounded-xl border border-blue-300 bg-white px-3 py-2.5 text-left">
                        <span className="text-[12px] text-muted">сумма с депозита</span>
                        <span className="font-display text-[18px] font-extrabold tabular-nums text-ink">{fmt(depositToUse)} ₽</span>
                      </button>
                    )}
                  </div>
                )}
                {/* Сводка: сколько закрываем сейчас / останется долгом.
                    Наличные («принимаем») вынесены ВНИЗ к кнопке — без дублей. */}
                <div className="rounded-2xl bg-surface-soft px-4 py-3">
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="text-muted-2">Закрываем сейчас</span>
                    <b className="font-display text-[17px] tabular-nums text-ink">{fmt(coveredNow)} ₽</b>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between text-[13px]">
                    <span className="text-muted-2">Останется долгом</span>
                    <b className={cn("font-display text-[17px] tabular-nums", remainDebt > 0 ? "text-orange-ink" : "text-emerald-600")}>{fmt(remainDebt)} ₽</b>
                  </div>
                </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* FOOTER — сумму наличных задаём ЗДЕСЬ (один раз, рядом с кнопкой),
              «Принять» спрашивает подтверждение. Без дублей сумм. */}
          <div className="border-t border-border bg-surface px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            {payStep < 2 ? (
              <div className="flex gap-2">
                {payStep > 0 && (
                  <button
                    type="button"
                    onClick={() => goPayStep(payStep - 1)}
                    className="h-12 flex-1 rounded-2xl bg-surface-soft text-[15px] font-semibold text-ink-2 transition-transform active:scale-[0.98]"
                  >
                    Назад
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => goPayStep(payStep + 1)}
                  className="h-12 flex-[2] rounded-2xl bg-blue-600 text-[15px] font-bold text-white transition-transform active:scale-[0.98]"
                >
                  Далее
                </button>
              </div>
            ) : (
              <>
                {/* Сумма наличных, которую реально принимаем (или сумма депозита,
                    если это предоплата). */}
                <button
                  type="button"
                  onClick={() => setPayPad("cash")}
                  className="mb-2.5 flex w-full items-center justify-between rounded-2xl border-2 border-blue-200 bg-blue-soft/15 px-4 py-3 text-left transition-colors active:border-blue-400"
                >
                  <span className="text-[12px] font-bold uppercase tracking-wider text-muted-2">
                    {isPrepay ? "Пополнить депозит на" : "Принимаем наличными"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="font-display text-[26px] font-extrabold tabular-nums text-blue-700">{fmt(accepted)} ₽</span>
                    <Pencil size={15} className="text-blue-600" />
                  </span>
                </button>
                {accepted > 0 && (
                  <div className="mb-2.5 flex items-center gap-2">
                    {METHODS.map((m) => {
                      const active = method === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMethod(m.id)}
                          className={cn("flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-semibold transition-colors", active ? "border-blue-600 bg-blue-600 text-white" : "border-border bg-surface text-ink-2")}
                        >
                          <m.Icon size={15} /> {m.label}
                        </button>
                      );
                    })}
                    {method === null && (
                      <span className="shrink-0 rounded-full bg-orange-soft px-1.5 py-1 text-[10px] font-bold text-orange-ink">способ?</span>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <button type="button" onClick={() => goPayStep(1)} className="h-12 flex-1 rounded-2xl bg-surface-soft text-[15px] font-semibold text-ink-2 transition-transform active:scale-[0.98]">Назад</button>
                  {isPrepay ? (
                    <button
                      type="button"
                      onClick={submitDepositTopup}
                      disabled={saving || accepted <= 0 || method === null}
                      className={cn("inline-flex h-12 flex-[2] items-center justify-center gap-1.5 rounded-2xl text-[15px] font-bold text-white transition-transform active:scale-[0.98]", saving || accepted <= 0 || method === null ? "bg-surface-soft text-muted-2" : "bg-blue-600")}
                    >
                      <Check size={16} /> {accepted > 0 ? `Пополнить депозит ${fmt(accepted)} ₽` : "Введите сумму"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirmDialog({
                          title: "Принять оплату?",
                          message: `Закрываем ${fmt(coveredNow)} ₽${remainDebt > 0 ? `, останется долгом ${fmt(remainDebt)} ₽` : " — всё закрывается полностью"}.`,
                          confirmText: "Да, принять",
                        });
                        if (ok) submit();
                      }}
                      disabled={submitDisabled}
                      className={cn("inline-flex h-12 flex-[2] items-center justify-center gap-1.5 rounded-2xl text-[15px] font-bold text-white transition-transform active:scale-[0.98]", submitDisabled ? "bg-surface-soft text-muted-2" : "bg-green-600")}
                    >
                      <Check size={16} /> Принять
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Нижний лист «простить просрочку» */}
          {forgiveMenuOpen && hasOverdue && (
            <div
              className="fixed inset-0 z-[140] flex flex-col justify-end bg-ink/45 backdrop-blur-sm animate-fade-in"
              onClick={() => setForgiveMenuOpen(false)}
            >
              <div
                className="rounded-t-3xl bg-surface pb-[max(env(safe-area-inset-bottom),1rem)] shadow-card-lg animate-sheet-up"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-center pb-1 pt-2.5">
                  <div className="h-1.5 w-10 rounded-full bg-muted-2/40" />
                </div>
                <div className="px-5 pt-1 text-center text-[15px] font-semibold text-ink">
                  Простить просрочку
                </div>
                <div className="px-5 pb-3 text-center text-[12px] text-muted-2">
                  Просрочка{overdueDaysHeader > 0 ? ` · ${overdueDaysHeader} дн` : ""} · {fmt(overdueBalanceRaw)} ₽
                </div>
                <div className="px-4">
                  {forgiveOptions.map((o) => {
                    const active = forgiveChoice === o.key;
                    return (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => setForgiveChoice(o.key as typeof forgiveChoice)}
                        className={cn("mb-2 flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-[14px] transition-colors", active ? "border-blue-500 bg-blue-soft/40 text-blue-700" : "border-border bg-surface text-ink")}
                      >
                        {active ? <CheckCircle2 size={18} className="text-blue-600" /> : <Circle size={18} className="text-muted-2" />}
                        <span className="flex-1 text-left">{o.label}</span>
                        <b className="tabular-nums text-muted">−{fmt(o.amount)} ₽</b>
                      </button>
                    );
                  })}
                  {hasOverdueDays && (
                    <div className={cn("mb-2 flex items-center gap-3 rounded-2xl border px-4 py-3 text-[14px] transition-colors", forgiveChoice === "days-n" ? "border-blue-500 bg-blue-soft/40 text-blue-700" : "border-border bg-surface text-ink")}>
                      <button type="button" onClick={() => setForgiveChoice("days-n")} className="flex items-center gap-3">
                        {forgiveChoice === "days-n" ? <CheckCircle2 size={18} className="text-blue-600" /> : <Circle size={18} className="text-muted-2" />}
                        <span>N дней</span>
                      </button>
                      <span className="ml-auto flex items-center gap-2">
                        <span className="flex items-center overflow-hidden rounded-lg border border-border">
                          <button type="button" onClick={() => setForgiveDaysN((n) => Math.max(1, n - 1))} className="flex h-8 w-8 items-center justify-center text-muted-2 active:bg-border">
                            <Minus size={14} />
                          </button>
                          <span className="w-8 text-center text-[14px] font-semibold tabular-nums">{forgiveDaysN}</span>
                          <button type="button" onClick={() => setForgiveDaysN((n) => Math.min(overdueDaysCount, n + 1))} className="flex h-8 w-8 items-center justify-center text-muted-2 active:bg-border">
                            <Plus size={14} />
                          </button>
                        </span>
                        <b className="w-16 text-right tabular-nums text-muted">−{fmt(forgiveDaysN * dayForgiveRate)} ₽</b>
                      </span>
                    </div>
                  )}
                  {forgiveChoice !== "clear" && (
                    <button type="button" onClick={() => setClearDebt()} className="mb-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface-soft px-4 py-2.5 text-[13px] font-semibold text-muted-2">
                      <X size={15} /> Не прощать
                    </button>
                  )}
                  <button type="button" onClick={() => setForgiveMenuOpen(false)} className="mb-1 h-12 w-full rounded-2xl bg-blue-600 text-[15px] font-bold text-white transition-transform active:scale-[0.98]">
                    Готово
                  </button>
                </div>
              </div>
            </div>
          )}

          {payPad && (
            <MobileNumPad
              label={padCfg.label}
              suffix="₽"
              hint={padCfg.hint}
              initial={padCfg.initial}
              max={padCfg.max}
              onCancel={() => setPayPad(null)}
              onConfirm={(n) => {
                if (payPad === "cash") {
                  setAcceptedStr(String(n));
                  setCashTouched(true);
                } else if (payPad === "security") {
                  setSecurityToUseStr(String(n));
                  setCashTouched(false);
                } else {
                  setDepositToUseStr(String(n));
                  setCashTouched(false);
                }
                setPayPad(null);
              }}
            />
          )}
        </div>
      </>
    );
  }

  if (completing) {
    return (
      <>
        {actPreview}
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ink/25 p-4 backdrop-blur-sm sm:p-6"
          onClick={requestClose}
        >
          {/* v0.9.4: пикер ущерба — отдельной панелью СЛЕВА, на том же слое
              (а не модалка поверх модалки). Окно завершения сдвигается вправо. */}
          <div
            // #27: на мобиле (<md) пикер и окно НЕ помещаются в ряд (440px +
            // карточка шире экрана → горизонтальное переполнение). Поэтому на
            // мобиле складываем в столбец (пикер сверху, полноширинный), на
            // md+ — прежний ряд (пикер слева, окно справа).
            className="my-auto flex w-full flex-col items-stretch gap-3 md:w-auto md:flex-row md:items-start md:justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <ReturnDamagePicker intake={intake} />
            <div className="w-full max-w-[760px]">{completingPanel}</div>
          </div>
        </div>
      </>
    );
  }

  if (inline) {
    return (
      <>
        <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card-sm">
          {panel}
        </aside>
        {actPreview}
      </>
    );
  }

  return (
    <>
      {actPreview}
      {/* v0.6.46: drawer без backdrop'a — календарь и левая колонка карточки
          остаются чёткими и интерактивными. Панель slide-in справа, поверх
          контента, закрытие — крестик внутри / Escape. */}
      <aside
        className={cn(
          "fixed right-0 top-0 bottom-0 z-[90] bg-surface shadow-card-lg ring-1 ring-border flex flex-col",
          // v0.9.2: завершение шире (две колонки), обычная оплата — узкая.
          completing ? "w-[min(96vw,900px)]" : "w-[min(95vw,480px)]",
          closing ? "animate-slide-out-right" : "animate-slide-in-right",
        )}
      >
        {panel}
      </aside>
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
  const closeTimer = useRef<number | null>(null);
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
    // Hover-intent: закрываем с задержкой, чтобы успеть навести на сам
    // popover (вход в него отменяет закрытие). Pinned (по клику) не трогаем.
    if (!popoverPinned) {
      if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
      closeTimer.current = window.setTimeout(() => setPopoverOpen(false), 250);
    }
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
              onMouseEnter={() => {
                if (closeTimer.current != null) {
                  window.clearTimeout(closeTimer.current);
                  closeTimer.current = null;
                }
                setPopoverOpen(true);
              }}
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

/**
 * v0.6.12: Step 3 — экипировка на новый период через inline-picker.
 *
 * Тайлы как в MasterBlock (см. rental-card/MasterBlock.tsx COLUMN 3),
 * но компактнее: квадратные аватарки в flex-wrap, hover → overlay
 * «Заменить», клик → EquipmentInlinePicker под тайлом.
 *
 * Тайл «+ Добавить» открывает picker в add-режиме (replacingIdx=-1).
 *
 * Подтверждение в picker'е вызывает equipmentChangeAsync — react-query
 * инвалидирует rental, equipmentJson обновится автоматически.
 */
function EquipmentStep({
  rental,
  equipment,
  equipDaily,
  hasDebtStep,
  onLocalChange,
}: {
  rental: Rental;
  equipment: Array<{ itemId?: number | null; name: string; price: number; free: boolean }>;
  equipDaily: number;
  hasDebtStep: boolean;
  // #177: редактирование набора экипировки нового периода — ЛОКАЛЬНО (через
  // этот колбэк), без немедленной мутации аренды. Picker получает local-mode.
  onLocalChange: (
    next: Array<{ itemId?: number | null; name: string; price: number; free: boolean }>,
  ) => void;
}) {
  // -1 = add-mode, >=0 = replacing existing index, null = closed.
  const [swapIdx, setSwapIdx] = useState<number | null>(null);
  const [hoverEqIdx, setHoverEqIdx] = useState<number | null>(null);
  const [pendingItem, setPendingItem] = useState<{
    itemId: number | null;
    name: string;
    price: number;
    free: boolean;
  } | null>(null);

  const isLive =
    rental.status === "active" || rental.status === "overdue";

  return (
    <div className="border-b border-border px-5 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
          {hasDebtStep ? "3" : "2"}
        </span>
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
          Экипировка на новый период
        </div>
        <span className="ml-auto text-[11px] text-muted">
          {equipDaily > 0 ? `+${equipDaily} ₽/сут` : "бесплатно"}
        </span>
      </div>
      <div className="rounded-[12px] border border-border bg-white p-2 min-h-[64px]">
        <div className="flex flex-wrap items-start gap-2">
          {equipment.length === 0 && swapIdx !== -1 && (
            <div className="px-2 py-2 text-[11.5px] text-muted-2">
              Без экипировки
            </div>
          )}
          {equipment.map((origIt, idx) => {
            const isOpen = swapIdx === idx;
            const showingPending = isOpen && pendingItem != null;
            const it = showingPending ? pendingItem : origIt;
            return (
              <EquipmentTile
                key={`${origIt.itemId ?? "noid"}-${idx}`}
                rental={rental}
                item={it}
                idx={idx}
                size="md"
                wrapperClassName="w-[72px]"
                canSwap={isLive}
                isOpen={isOpen}
                isHover={hoverEqIdx === idx}
                showingPending={showingPending}
                onHover={setHoverEqIdx}
                onToggleOpen={setSwapIdx}
                onClose={() => {
                  setSwapIdx(null);
                  setPendingItem(null);
                }}
                onPreviewChange={setPendingItem}
                localEquipment={equipment}
                onLocalChange={onLocalChange}
              />
            );
          })}
          {isLive && (
            <EquipmentAddTile
              rental={rental}
              size="md"
              wrapperClassName="w-[72px]"
              isOpen={swapIdx === -1}
              pendingItem={pendingItem}
              onToggleOpen={(open) => setSwapIdx(open ? -1 : null)}
              onClose={() => {
                setSwapIdx(null);
                setPendingItem(null);
              }}
              onPreviewChange={setPendingItem}
              localEquipment={equipment}
              onLocalChange={onLocalChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
