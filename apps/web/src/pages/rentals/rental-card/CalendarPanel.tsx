/**
 * CalendarPanel — левая часть нижнего ряда v0.6 карточки. Показывает:
 *   • Блок «Выдача» (дата + время)
 *   • Блок «Возврат» (план или просрочка, дата + время)
 *   • Месячный календарь с drag-to-extend (синий период, красная просрочка,
 *     зелёный preview продления). Реализация — DragExtendCalendar.
 *
 * v0.6.1: drag-to-extend подключён. Mouse-drag по правому handle последнего
 * дня запускает preview, на mouse-up вызывается onCommitExtend(days) — RentalCard
 * открывает PaymentAcceptDialog с предзаполненным числом дней.
 */
import { useEffect, useMemo, useState, type Ref } from "react";
import { CalendarCog, SquareParking, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DragExtendCalendar } from "./DragExtendCalendar";
import {
  MIN_RENTAL_DAYS,
  periodForDays,
  ratePeriodForDays,
  TARIFF_PERIOD_LABEL,
  type Rental,
  type RentalStatus,
  type TariffPeriod,
} from "@/lib/mock/rentals";
import {
  useRentalParking,
  useCreateParking,
  useEndParking,
  useDeleteParking,
  parkingAmount,
  PARKING_MAX_DAYS,
} from "@/lib/api/parking";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { ParkingDrawer } from "./ParkingDialog";
import { toastRentalDone } from "../rentalUndo";

/** Паркинг-период: YYYY-MM-DD + n дней / число суток в периоде включительно. */
const addDaysIsoP = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
const inclusiveDaysP = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  ) + 1;

/** DD.MM.YYYY → YYYY-MM-DD */
function ruToIso(ru: string | undefined | null): string | null {
  if (!ru) return null;
  const m = ru.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function diffDaysIso(fromIso: string, toIso: string): number {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** Знаковая разница дней (toIso − fromIso): может быть отрицательной. */
function signedDiffDays(fromIso: string, toIso: string): number {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  return Math.round((b - a) / 86400000);
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** YYYY-MM-DD → DD.MM */
function isoToShort(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}` : iso;
}

/** Прибавляет `days` к ISO-дате (YYYY-MM-DD), возвращает ISO. */
function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** 12000 → «12 000» */
function fmtNum(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function CalendarPanel({
  rental,
  effectiveStatus,
  onCommitExtend,
  onChangePeriod,
  canEditPeriod = true,
  lastBranch,
  previewRate,
  rateForTariff,
  calendarBoxRef,
  hideCalendar,
  resetSignal,
  initialExtDays,
  armParkingSignal,
  paymentDateIso,
  onParkingPeriod,
  onParkingCancel,
}: {
  rental: Rental;
  effectiveStatus: RentalStatus;
  /** v0.6.24: вызывается на click по дню > baseEnd с числом дней. */
  onCommitExtend?: (days: number) => void;
  /**
   * v0.6.50: «Изменить период» — перевыбор ТОЛЬКО даты возврата (старт
   * фиксирован). Пересчитывает days/tier/rate/sum и отправляет в RentalCard,
   * который вызывает patchRental + логирует было→стало. Если не передан —
   * кнопка не показывается.
   */
  onChangePeriod?: (next: {
    endPlannedAtIso: string;
    days: number;
    rate: number;
    sum: number;
    tariffPeriod: Exclude<TariffPeriod, "day">;
    /** v0.8.x: id rent-платежа последней ветки (только для продлённой аренды). */
    rentPaymentId?: number;
    /** v0.8.x: новая сумма последней ветки (к ней синхронизируется платёж). */
    branchSum?: number;
    /** v0.8.x: уже оплачено по последней ветке (для расчёта излишка). */
    paidBranchSum?: number;
  }) => void;
  /**
   * v0.6.51 / v0.8.x: раньше false блокировало кнопку на продлённой аренде.
   * Теперь продлённые правятся через «последнюю ветку» (см. lastBranch), и
   * флаг остаётся true. Проп сохранён для совместимости/будущих блокировок.
   */
  canEditPeriod?: boolean;
  /**
   * v0.8.x: для ПРОДЛЁННОЙ аренды — данные последней ветки продления.
   * null = аренда одно-периодная (правим как раньше — весь период).
   *   • end1Iso  — граница последней ветки (начало последнего продления);
   *   • end2Iso  — текущий возврат (= rental.endPlanned);
   *   • branchDays — дни последней ветки (N из заметки «продление на N дн»);
   *   • paymentId  — rent-платёж этой ветки (его amount синхронизируем);
   *   • currentBranchAmount — текущая сумма платежа ветки;
   *   • paidBranchSum — оплачено по ветке (paid ? amount : 0).
   * «Изменить период» на такой аренде двигает ТОЛЬКО дату возврата в
   * пределах [end1 … позже]; раньше end1 нельзя (это сократило бы прошлый,
   * уже оплаченный период — анти-фрод).
   */
  lastBranch?: {
    paymentId: number;
    branchDays: number;
    end1Iso: string;
    end2Iso: string;
    paidBranchSum: number;
    currentBranchAmount: number;
  } | null;
  /**
   * v0.6.50: ставка ₽/сут для N дней по тарифной сетке модели аренды.
   * Резолвится в RentalCard (useModelRateResolver). Используется в превью
   * «Изменить период» и при фиксации нового sum.
   */
  previewRate?: (days: number) => number;
  /**
   * F1: ставка ₽/сут по ВЫБРАННОМУ тарифу (short/week/month) из сетки модели.
   * Резолвится в RentalCard (resolveRate(rental, period)). Когда задана — в
   * режиме «Изменить период» показываем переключатель тарифа: оператор может
   * вручную выбрать ступень, сумма и остаток пересчитываются вживую.
   */
  rateForTariff?: (t: Exclude<TariffPeriod, "day">) => number;
  /** v0.6.13: ref на обёртку DragExtendCalendar — нужен для FLIP-измерения
   *  начальной позиции при подъёме календаря в floating-режим. */
  calendarBoxRef?: Ref<HTMLDivElement>;
  /** v0.6.13: когда true — оригинальный календарь скрыт (visibility:hidden),
   *  чтобы не дублировать с floating-копией. Сохраняем место в layout, чтобы
   *  карточка не «дёргалась». */
  hideCalendar?: boolean;
  /** v0.6.17: сигнал родителя для сброса зелёной preview-зоны. */
  resetSignal?: number;
  /** v0.6.24: текущее число дней продления из PaymentAcceptDialog
   *  (когда диалог открыт). Синхронизирует календарь с input'ом. */
  initialExtDays?: number;
  /** v0.8.0: бамп из ⋯-меню «Поставить на паркинг» — включает режим. */
  armParkingSignal?: number;
  /** v0.9.4: дата оплаты (back-date) — якорь превью продления в календаре. */
  paymentDateIso?: string | null;
  /** Паркинг-период: оператор выбрал период на календаре → открыть
   *  паркинг-дровер у родителя (push-колонка). Если не передан — карточка
   *  откроет дровер сама (overlay-fallback). */
  onParkingPeriod?: (
    startIso: string,
    days: number,
    settle?: { sessionId: number; amount: number },
  ) => void;
  /** Отмена паркинга на карточке (кнопка «Отмена») → закрыть паркинг-дровер
   *  у родителя (push-колонка), если он открыт. Иначе рассинхрон: календарь
   *  вышел из режима, а дровер висит. В fallback-режиме дровер закрывается
   *  через setLocalPeriod(null) — этот колбэк нужен только для host-режима. */
  onParkingCancel?: () => void;
}) {
  const startIso = ruToIso(rental.start);
  const endIso = ruToIso(rental.endPlanned);
  const isOverdue = effectiveStatus === "overdue";
  const overdueDays = isOverdue && endIso ? diffDaysIso(endIso, todayIso()) : 0;

  const dailyRate =
    rental.rateUnit === "week" ? Math.round(rental.rate / 7) : rental.rate;

  // Запрет drag для архивных/завершённых
  const isArchived = !!rental.archivedAt;
  const isCompleted =
    rental.status === "completed" || rental.status === "completed_damage";
  const dragDisabled = isArchived || isCompleted || !onCommitExtend;

  /* ---- v0.8.0 ПАРКИНГ ---- */
  const { sessions } = useRentalParking(rental.id);
  const createParking = useCreateParking();
  const endParking = useEndParking();
  const deleteParking = useDeleteParking();
  const [parkingMode, setParkingMode] = useState(false);
  const [draftStart, setDraftStart] = useState<string | null>(null);
  // Конец выбранного периода (фиксируется 2-м кликом, жёлтым) + наведённая
  // дата (live-превью периода/суммы при перетягивании по календарю).
  const [draftEnd, setDraftEnd] = useState<string | null>(null);
  const [parkingHoverEnd, setParkingHoverEnd] = useState<string | null>(null);
  // v0.8.27 (G4): паркинг открытый — выбираем только дату начала; конец
  // определяется ручным/авто снятием. Тумблер «первый день бесплатно».
  const [freeFirstDay, setFreeFirstDay] = useState(true);
  // Окно постановки/оплаты паркинга (оба режима). Заменяет старый календарный
  // режим выбора даты — он оставлен дормантным под флагом parkingMode.
  // Fallback-дровер паркинга (когда родитель не управляет push-колонкой —
  // дашборд/мобила): период, выбранный на календаре.
  const [localPeriod, setLocalPeriod] = useState<{
    startDate: string;
    days: number;
    /** Режим расчёта снятого открытого паркинга (сессия уже закрыта). */
    settle?: { sessionId: number; amount: number };
  } | null>(null);
  const [parkingMenuOpen, setParkingMenuOpen] = useState(false);

  /* ---- v0.6.50 «ИЗМЕНИТЬ ПЕРИОД» ---- */
  // Коррекция аренды: перевыбор ТОЛЬКО даты возврата (старт фиксирован).
  // editMode и parkingMode взаимоисключающие. Кнопка доступна только если
  // RentalCard передал onChangePeriod (есть резолвер ставки и patch-флоу) и
  // у аренды есть реальные даты (не «—» у заявок/отменённых).
  const canChangePeriod =
    !dragDisabled && !!onChangePeriod && !!previewRate && !!startIso && !!endIso;
  const [editMode, setEditMode] = useState(false);
  // Выбранная новая дата возврата (ISO YYYY-MM-DD). null до входа в режим.
  const [editEndIso, setEditEndIso] = useState<string | null>(null);
  // F1: ручной выбор тарифа в «Изменить период». null = авто (по числу дней).
  const [tariffOverride, setTariffOverride] = useState<Exclude<
    TariffPeriod,
    "day"
  > | null>(null);
  const exitEdit = () => {
    setEditMode(false);
    setEditEndIso(null);
    setTariffOverride(null);
  };
  const enterEdit = () => {
    // Взаимоисключение: вход в «Изменить период» гасит паркинг.
    setParkingMode(false);
    setDraftStart(null);
    setEditMode(true);
    // v0.6.50: НИЧЕГО не выбираем при входе — текущий период на календаре
    // показывается приглушённым (editDim), а «Зафиксировать» стартует
    // неактивной. Новую дату возврата оператор кликает прямо на календаре.
    setEditEndIso(null);
    setTariffOverride(null);
  };

  // v0.8.x: продлённая аренда — правим ТОЛЬКО последнюю ветку. Зона «было» на
  // календаре начинается с end1 (граница ветки), а не со старта; минимально
  // допустимая дата возврата = end1 (раньше нельзя — это сократило бы прошлый,
  // уже оплаченный период; анти-фрод).
  const isBranchEdit = !!lastBranch;
  // Левая граница приглушённой «текущей» зоны в режиме редактирования:
  // продлённая — end1 (последняя ветка), одно-периодная — старт.
  const editDimFromIso = isBranchEdit ? lastBranch!.end1Iso : startIso;

  // Минимально допустимая дата возврата:
  //   • продлённая  → end1 (нельзя залезть в прошлую ветку);
  //   • одно-период → сдвиг от ТЕКУЩЕГО возврата назад так, чтобы осталось не
  //     меньше MIN_RENTAL_DAYS дней аренды (считаем от endIso, т.к. паркинг/
  //     правки делают возврат ≠ старт + дни).
  const editMinEndIso = isBranchEdit
    ? lastBranch!.end1Iso
    : endIso
      ? addDaysIso(endIso, -Math.max(0, rental.days - MIN_RENTAL_DAYS))
      : null;
  // Дневная стоимость платной экипировки (как в ExtendRentalDialog) —
  // прибавляется к ставке при расчёте суммы.
  const equipmentDaily = useMemo(
    () =>
      (rental.equipmentJson ?? []).reduce(
        (s, it) => s + (it.free ? 0 : it.price ?? 0),
        0,
      ),
    [rental.equipmentJson],
  );
  // Пересчёт. Две ветви:
  //   • ОДНО-ПЕРИОДНАЯ: новое число дней = текущие дни + сдвиг возврата;
  //     days → tier → rate → sum (как раньше). Возвращаются ИТОГОВЫЕ значения.
  //   • ПРОДЛЁННАЯ: пересчитываем ТОЛЬКО последнюю ветку. Дни ветки =
  //     (новый возврат − end1). Ставка ветки = текущая дневная ставка аренды
  //     (rental.rate, по которой было оформлено последнее продление) — БЕЗ
  //     ре-тарификации (двигаем дату, не меняем цену продления). Сумма ветки =
  //     (ставка + экипировка) × дни ветки. ИТОГ по аренде:
  //       days = (rental.days − старые дни ветки) + новые дни ветки
  //       sum  = (rental.sum  − текущая сумма платежа ветки) + сумма ветки
  //     Так первоначальный период и прошлые ветки остаются нетронутыми, а
  //     сумма аренды = первоначалка + новая последняя ветка (рубль-в-рубль).
  const editPreview = useMemo(() => {
    if (!editMode || !endIso || !editEndIso || !previewRate) return null;
    if (isBranchEdit) {
      const lb = lastBranch!;
      // Дни последней ветки: новый возврат − end1 (зажато снизу нулём — на
      // end1 ветка схлопывается в 0 дней = продление отменено).
      const branchDays = Math.max(0, signedDiffDays(lb.end1Iso, editEndIso));
      // F1: ставка ветки — текущая дневная (без ре-тарификации) ЛИБО выбранный
      // вручную тариф из сетки модели.
      const branchRate =
        tariffOverride && rateForTariff
          ? rateForTariff(tariffOverride)
          : dailyRate;
      const branchSum = (branchRate + equipmentDaily) * branchDays;
      const days = rental.days - lb.branchDays + branchDays;
      const sum = rental.sum - lb.currentBranchAmount + branchSum;
      // tariffPeriod для всей аренды считаем по ИТОГОВЫМ дням (поле rental),
      // либо берём вручную выбранный тариф.
      const tariffPeriod = (tariffOverride ??
        periodForDays(Math.max(MIN_RENTAL_DAYS, days))) as Exclude<
        TariffPeriod,
        "day"
      >;
      return {
        days,
        rate: branchRate,
        sum,
        tariffPeriod,
        ratePeriod:
          tariffOverride ?? ratePeriodForDays(Math.max(MIN_RENTAL_DAYS, days)),
        branch: { days: branchDays, sum: branchSum, rate: branchRate },
      };
    }
    const deltaDays = signedDiffDays(endIso, editEndIso);
    const days = Math.max(MIN_RENTAL_DAYS, rental.days + deltaDays);
    const newTier = ratePeriodForDays(days);
    const oldTier = ratePeriodForDays(rental.days);
    // Ставка: если тарифная ступень НЕ изменилась — сохраняем текущую
    // дневную ставку аренды (не нормализуем к каталожной — иначе открытие
    // без правок показывало бы ложную разницу и стирало возможную скидку).
    // При смене ступени — берём ставку новой ступени из каталога.
    // F1: авто-ставка (как раньше) ЛИБО вручную выбранный тариф из сетки.
    const autoRate = newTier === oldTier ? dailyRate : previewRate(days);
    const rate =
      tariffOverride && rateForTariff ? rateForTariff(tariffOverride) : autoRate;
    const sum = (rate + equipmentDaily) * days;
    const tariffPeriod = (tariffOverride ?? periodForDays(days)) as Exclude<
      TariffPeriod,
      "day"
    >;
    return {
      days,
      rate,
      sum,
      tariffPeriod,
      ratePeriod: tariffOverride ?? newTier,
      branch: null,
    };
  }, [
    editMode,
    endIso,
    editEndIso,
    previewRate,
    rateForTariff,
    tariffOverride,
    equipmentDaily,
    rental.days,
    rental.sum,
    dailyRate,
    isBranchEdit,
    lastBranch,
  ]);

  const commitEdit = () => {
    if (!editPreview || !editEndIso || !endIso) return;
    if (isBranchEdit && editPreview.branch) {
      const lb = lastBranch!;
      // Новый возврат = end1 + дни ветки (зажато до end1 при 0 днях).
      const endIsoClamped = addDaysIso(lb.end1Iso, editPreview.branch.days);
      onChangePeriod?.({
        endPlannedAtIso: endIsoClamped,
        days: editPreview.days,
        rate: editPreview.rate,
        sum: editPreview.sum,
        tariffPeriod: editPreview.tariffPeriod,
        rentPaymentId: lb.paymentId,
        branchSum: editPreview.branch.sum,
        paidBranchSum: lb.paidBranchSum,
      });
      exitEdit();
      return;
    }
    // Новая дата возврата = текущий возврат, сдвинутый на разницу дней
    // (editPreview.days зажат снизу до MIN, поэтому если оператор ввёл
    // слишком раннюю дату — возврат подтянется к минимально допустимому).
    const endIsoClamped = addDaysIso(endIso, editPreview.days - rental.days);
    onChangePeriod?.({
      endPlannedAtIso: endIsoClamped,
      days: editPreview.days,
      rate: editPreview.rate,
      sum: editPreview.sum,
      tariffPeriod: editPreview.tariffPeriod,
    });
    exitEdit();
  };

  // v0.8.18 (E1): текущая активная/запланированная сессия — чтобы кнопка
  // переключалась на «Снять с паркинга».
  const activeSession = useMemo(
    () =>
      [...sessions]
        .filter((s) => s.status === "active")
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .pop() ?? null,
    [sessions],
  );
  const removeParking = () => {
    if (!activeSession) return;
    const args = { rentalId: rental.id, sessionId: activeSession.id };
    // Будущий паркинг — просто удаляем (накопления нет).
    if (activeSession.startDate > todayIso()) {
      deleteParking.mutate(args, {
        onSuccess: () => toast.success("Паркинг отменён"),
        onError: () => toast.error("Не удалось снять с паркинга"),
      });
      return;
    }
    // Предоплаченный: ранний возврат бэкенд пересчитывает по факту и
    // возвращает излишек на депозит клиента (показываем в тосте).
    if (activeSession.prepaid) {
      endParking
        .mutateAsync(args)
        .then((res) => {
          const refund = res.refund ?? 0;
          toastRentalDone(
            rental,
            "Снят с паркинга",
            refund > 0
              ? `Излишек ${refund.toLocaleString("ru-RU")} ₽ → депозит клиента`
              : "Возврат пересчитан",
          );
        })
        .catch(() => toast.error("Не удалось снять с паркинга"));
      return;
    }
    // ОТКРЫТЫЙ (постоплата): закрываем сессию и открываем окно оплаты с
    // накопленной суммой → Оплатить (нал/перевод/депозит) или закрыть → долг.
    endParking
      .mutateAsync(args)
      .then((res) => {
        const s = res.session;
        const unpaid = Math.max(0, s.amount - s.paidAmount);
        if (unpaid <= 0) {
          toastRentalDone(rental, "Снят с паркинга");
          return;
        }
        const settle = { sessionId: s.id, amount: unpaid };
        if (onParkingPeriod) onParkingPeriod(s.startDate, s.days, settle);
        else setLocalPeriod({ startDate: s.startDate, days: s.days, settle });
      })
      .catch(() => toast.error("Не удалось снять с паркинга"));
  };

  // Вход в режим по сигналу из ⋯-меню.
  const [seenArm, setSeenArm] = useState(armParkingSignal);
  if (armParkingSignal !== seenArm) {
    setSeenArm(armParkingSignal);
    if (armParkingSignal !== undefined && !dragDisabled) {
      // Взаимоисключение с «Изменить период».
      setEditMode(false);
      setEditEndIso(null);
      setParkingMode(true);
      setDraftStart(null);
      setFreeFirstDay(true);
    }
  }

  // v0.8.27: открытый паркинг — конец не выбираем, поэтому превью-сдвига нет.
  const calEndIso = endIso;

  // Зоны: зафиксированные сессии + выбранный день начала (одиночный).
  const parkingRanges = useMemo(() => {
    const ranges = sessions.map((s) => ({
      startIso: s.startDate,
      endIso: s.endDate,
    }));
    // Черновик периода — жёлтым: от начала до зафиксированного конца, либо до
    // наведённой даты (live-превью), либо одиночный день начала.
    if (draftStart) {
      const end =
        draftEnd ??
        (parkingHoverEnd && parkingHoverEnd >= draftStart
          ? parkingHoverEnd
          : draftStart);
      ranges.push({ startIso: draftStart, endIso: end });
    }
    return ranges;
  }, [sessions, draftStart, draftEnd, parkingHoverEnd]);

  // F3: периоды УЖЕ существующих сессий (без черновика) — их дни нельзя
  // выбрать повторно. Один день не может попасть в паркинг дважды.
  const parkingOccupiedRanges = useMemo(
    () => sessions.map((s) => ({ startIso: s.startDate, endIso: s.endDate })),
    [sessions],
  );

  // Окно выбора: до выбора начала — от выдачи; после — конец в пределах 7 дн.
  const selFrom = draftStart ?? startIso;
  const selTo: string | null = draftStart
    ? addDaysIsoP(draftStart, PARKING_MAX_DAYS - 1)
    : null;

  // Двухкликовый выбор ПЕРИОДА паркинга: 1-й клик — начало, 2-й — конец
  // (в пределах 7 дн). Как выбрали конец — открываем паркинг-дровер.
  const handleParkingPick = (iso: string) => {
    // Новый выбор начинается, если периода ещё нет или он уже завершён —
    // ОСТАёМСЯ в режиме паркинга, пока не оплатим/в-долг/отмена.
    if (!draftStart || draftEnd) {
      setDraftStart(iso);
      setDraftEnd(null);
      setParkingHoverEnd(null);
      return;
    }
    if (iso >= draftStart && inclusiveDaysP(draftStart, iso) <= PARKING_MAX_DAYS) {
      const s = draftStart;
      const d = inclusiveDaysP(s, iso);
      // Фиксируем период (жёлтым) и открываем/обновляем дровер; режим паркинга
      // НЕ выходим — повторный клик перевыберет период (синхронно дроверу).
      setDraftEnd(iso);
      setParkingHoverEnd(null);
      if (onParkingPeriod) onParkingPeriod(s, d);
      else setLocalPeriod({ startDate: s, days: d });
      return;
    }
    // клик раньше начала или > лимита — начинаем период заново с этого дня
    setDraftStart(iso);
    setDraftEnd(null);
    setParkingHoverEnd(null);
  };

  const exitParking = () => {
    setParkingMode(false);
    setDraftStart(null);
    setDraftEnd(null);
    setParkingHoverEnd(null);
    setFreeFirstDay(true);
    // Закрываем дровер, иначе он повиснет без выбора на календаре:
    //   • fallback (дашборд/мобила) — свой inline-дровер;
    //   • host (Аренды) — push-колонка у родителя.
    setLocalPeriod(null);
    onParkingCancel?.();
  };

  // Родитель закрыл паркинг-дровер (Оплатить / В долг / Отмена) → он бампает
  // resetSignal. Это наш сигнал выйти из режима паркинга и очистить черновик
  // периода. Пока дровер открыт, parkingMode остаётся включённым, поэтому
  // повторный клик по календарю перевыбирает период (синхронно с дровером).
  useEffect(() => {
    setParkingMode(false);
    setDraftStart(null);
    setDraftEnd(null);
    setParkingHoverEnd(null);
    setFreeFirstDay(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  // «Просто поставить» — открытый паркинг (постоплата) мгновенно с сегодня,
  // без дровера (оплата по факту при снятии).
  const instantOpenParking = () => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow",
    }).format(new Date());
    createParking.mutate(
      { rentalId: rental.id, startDate: today, freeFirstDay: true },
      {
        onSuccess: () =>
          toastRentalDone(
            rental,
            "Поставлен на паркинг",
            "Открытый · оплата по факту",
          ),
        onError: (err) => {
          const overlap =
            err instanceof ApiError &&
            err.status === 400 &&
            (err.body as { error?: string } | null)?.error ===
              "parking_overlap";
          toast.error(
            overlap
              ? "Период паркинга пересекается с уже существующим"
              : "Не удалось поставить на паркинг",
          );
        },
      },
    );
  };

  const toggleParkingButton = () => {
    if (!parkingMode) {
      // Меню выбора: «просто поставить» (открытый) / «на период» (дровер оплаты).
      // Старый календарный режим (parkingMode/draftStart) оставлен дормантным.
      setEditMode(false);
      setEditEndIso(null);
      setParkingMenuOpen((v) => !v);
      return;
    }
    // повторный клик = зафиксировать (нужна выбранная дата начала)
    if (draftStart) {
      createParking.mutate(
        { rentalId: rental.id, startDate: draftStart, freeFirstDay },
        {
          onSuccess: () => {
            toastRentalDone(
              rental,
              "Поставлен на паркинг",
              "Идёт до снятия (макс 7 дн)",
            );
            exitParking();
          },
          // F3: сервер вернул 400 — показываем понятный текст (в т.ч.
          // пересечение периодов паркинга). ApiError.message уже содержит
          // человеческое сообщение от сервера.
          onError: (err) => {
            const overlap =
              err instanceof ApiError && err.status === 400
                ? (err.body as { error?: string } | null)?.error ===
                  "parking_overlap"
                : false;
            toast.error(
              overlap
                ? "Период паркинга пересекается с уже существующим"
                : "Не удалось поставить на паркинг",
            );
          },
        },
      );
    } else {
      exitParking();
    }
  };

  return (
    <div className="rounded-2xl bg-surface border border-border shadow-card-sm p-4">
      {localPeriod && (
        <ParkingDrawer
          rental={rental}
          startIso={localPeriod.startDate}
          days={localPeriod.days}
          settle={localPeriod.settle}
          onClose={() => {
            setLocalPeriod(null);
            exitParking();
          }}
        />
      )}
      {/* v0.6.49: заголовок «ДАТА ВОЗВРАТА» — uppercase серым по эталону.
          v0.8.0: кнопка 🅿 справа — вход/фиксация режима паркинга. */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-muted-2">
          Дата возврата
        </div>
        {!dragDisabled && (
          <div className="flex flex-wrap items-center justify-end gap-1">
            {/* v0.6.50: «Изменить период» — коррекция даты возврата. В режиме
                редактирования кнопка превращается в «Отмена»+«Зафиксировать»;
                паркинг-кнопки в это время скрыты (режимы взаимоисключающие). */}
            {editMode ? (
              <>
                <button
                  type="button"
                  onClick={exitEdit}
                  title="Отмена"
                  className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12px] font-semibold text-muted hover:bg-surface-soft hover:text-ink"
                >
                  <X size={13} /> Отмена
                </button>
                <button
                  type="button"
                  onClick={commitEdit}
                  disabled={!editPreview || !editEndIso || editEndIso === endIso}
                  title="Зафиксировать новый период"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-600 bg-blue-600 px-3 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60"
                >
                  <CalendarCog size={14} /> Зафиксировать
                </button>
              </>
            ) : (
              <>
                {canChangePeriod && !parkingMode && (
                  <button
                    type="button"
                    onClick={canEditPeriod ? enterEdit : undefined}
                    disabled={!canEditPeriod}
                    title={
                      canEditPeriod
                        ? "Изменить период (перевыбрать дату возврата)"
                        : "Аренду продлевали — период правится в продлении, не здесь"
                    }
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[12px] font-semibold text-ink shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-surface"
                  >
                    <CalendarCog size={14} /> Изменить период
                  </button>
                )}
                {parkingMode && (
                  <button
                    type="button"
                    onClick={exitParking}
                    title="Отмена"
                    className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12px] font-semibold text-muted hover:bg-surface-soft hover:text-ink"
                  >
                    <X size={13} /> Отмена
                  </button>
                )}
                {/* v0.8.15/0.8.18: явная КНОПКА. Без паркинга — «Поставить на
                    паркинг»; если паркинг уже есть — «Снять с паркинга» (красная);
                    в режиме выбора — «Выберите период»/«Зафиксировать». */}
                {!parkingMode &&
                  (activeSession ? (
              <button
                type="button"
                onClick={removeParking}
                disabled={endParking.isPending || deleteParking.isPending}
                title="Снять с паркинга"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-red-soft/60 px-3 text-[12px] font-semibold text-red-ink shadow-sm transition-colors hover:bg-red-soft active:scale-[0.98] disabled:opacity-60"
              >
                <SquareParking size={14} /> Снять с паркинга
              </button>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={toggleParkingButton}
                  title="Поставить на паркинг"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-yellow-300 bg-yellow-100 px-3 text-[12px] font-semibold text-yellow-900 shadow-sm transition-colors hover:border-yellow-400 hover:bg-yellow-200 active:scale-[0.98]"
                >
                  <SquareParking size={14} /> Поставить на паркинг
                </button>
                {parkingMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setParkingMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-[calc(100%+4px)] z-30 w-60 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-card-lg">
                      <button
                        type="button"
                        onClick={() => {
                          setParkingMenuOpen(false);
                          instantOpenParking();
                        }}
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-surface-soft"
                      >
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                          <SquareParking size={13} className="text-yellow-600" />{" "}
                          Просто поставить
                        </span>
                        <span className="text-[11px] text-muted-2">
                          Открытый · оплата по факту при снятии
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setParkingMenuOpen(false);
                          setEditMode(false);
                          setEditEndIso(null);
                          setParkingMode(true);
                          setDraftStart(null);
                        }}
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-surface-soft"
                      >
                        <span className="text-[13px] font-semibold text-ink">
                          На период · оплата
                        </span>
                        <span className="text-[11px] text-muted-2">
                          Выбрать дни и сразу оплатить (или в долг)
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
                  ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* v0.8.28 (H6): сводка открытого паркинга. Тумблер «1-й день бесплатно»
          убран с карточки — все расчёты происходят на этапе «Принять оплату». */}
      {parkingMode &&
        (() => {
          // Live-конец периода: зафиксированный 2-м кликом → наведённый при
          // перетягивании → нет. Пока тянем по календарю, считаем дни и сумму
          // тут же, ничего не фиксируя.
          const liveEnd =
            draftStart == null
              ? null
              : (draftEnd ??
                (parkingHoverEnd && parkingHoverEnd >= draftStart
                  ? parkingHoverEnd
                  : null));
          const liveDays =
            draftStart && liveEnd ? inclusiveDaysP(draftStart, liveEnd) : 0;
          const liveAmount = liveDays
            ? parkingAmount(liveDays, freeFirstDay)
            : 0;
          return (
            <div className="mb-2.5 rounded-[10px] border border-yellow-300 bg-yellow-50 px-3 py-2 text-[12px] text-yellow-900">
              {!draftStart ? (
                <span>
                  Кликните <b>дату начала</b> паркинга — можно задним числом (по
                  прошедшим/просроченным дням) или вперёд.
                </span>
              ) : !liveEnd ? (
                <span>
                  Начало <b>{isoToShort(draftStart)}</b> · наведите/кликните{" "}
                  <b>дату конца</b> (макс {PARKING_MAX_DAYS} дн).
                </span>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span>
                    Паркинг{" "}
                    <b>
                      {isoToShort(draftStart)}–{isoToShort(liveEnd)}
                    </b>{" "}
                    · <b>{liveDays}</b> дн
                    {freeFirstDay ? " · 1-й день бесплатно" : ""}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {fmtNum(liveAmount)} ₽
                  </span>
                </div>
              )}
            </div>
          );
        })()}

      {/* v0.6.50: «Изменить период» правится ПРЯМО на календаре — новую дату
          возврата оператор кликает на той же сетке (текущий период там
          приглушён). Здесь — только компактная сводка НАД календарём:
          пока ничего не выбрано — подсказка «кликните дату»; после клика —
          сводка было→стало. Стиль как у блока-сводки паркинга. */}
      {editMode && (
        <div className="mb-2.5 rounded-[10px] border border-blue-200 bg-blue-50/70 px-3 py-2">
          {/* v0.8.x: для ПРОДЛЁННОЙ аренды правится только последняя ветка —
              «Было/Стало» считаем по ВЕТКЕ (а не по всей аренде), и явно об
              этом говорим. Цифры «Было» ветки: дни/сумма последнего продления;
              «Стало»: пересчитанная ветка. Разница = новая ветка − старая ветка. */}
          {isBranchEdit && lastBranch ? (
            !editPreview || !editPreview.branch ? (
              <span className="text-[12px] text-ink-2">
                📅 Правим <b>последнее продление</b> ({isoToShort(lastBranch.end1Iso)}–
                {isoToShort(lastBranch.end2Iso)}). Кликните новую дату возврата —
                не раньше <b>{isoToShort(lastBranch.end1Iso)}</b> (прошлый период
                не двигаем).
              </span>
            ) : (
              <div className="flex flex-col gap-1 text-[12px] text-ink-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700/80">
                  Последнее продление
                </div>
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="text-muted-2">Было:</span>
                  <b className="tabular-nums">{lastBranch.branchDays} дн</b>
                  <span className="text-muted-2">· тариф</span>
                  <b className="tabular-nums">{dailyRate} ₽/сут</b>
                  <span className="text-muted-2">· ветка</span>
                  <b className="tabular-nums">
                    {fmtNum(lastBranch.currentBranchAmount)} ₽
                  </b>
                </div>
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="font-semibold text-blue-700">Стало:</span>
                  <b className="tabular-nums text-blue-700">
                    {editPreview.branch.days} дн
                  </b>
                  <span className="text-muted-2">· тариф</span>
                  <b className="tabular-nums text-blue-700">
                    {editPreview.branch.rate} ₽/сут
                  </b>
                  <span className="text-muted-2">· ветка</span>
                  <b className="tabular-nums text-blue-700">
                    {fmtNum(editPreview.branch.sum)} ₽
                  </b>
                </div>
                {editPreview.branch.sum !== lastBranch.currentBranchAmount && (
                  <div
                    className={cn(
                      "mt-0.5 text-[11.5px] font-semibold",
                      editPreview.branch.sum > lastBranch.currentBranchAmount
                        ? "text-emerald-700"
                        : "text-red-ink",
                    )}
                  >
                    Разница по ветке:{" "}
                    {editPreview.branch.sum > lastBranch.currentBranchAmount
                      ? "+"
                      : "−"}
                    {fmtNum(
                      Math.abs(
                        editPreview.branch.sum - lastBranch.currentBranchAmount,
                      ),
                    )}{" "}
                    ₽ · сумма аренды {fmtNum(editPreview.sum)} ₽
                  </div>
                )}
              </div>
            )
          ) : !editPreview ? (
            <span className="text-[12px] text-ink-2">
              📅 Кликните на календаре новую дату возврата. Старт{" "}
              <b>{rental.start}</b> зафиксирован.
            </span>
          ) : (
            <div className="flex flex-col gap-1 text-[12px] text-ink-2">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="text-muted-2">Было:</span>
                <b className="tabular-nums">{rental.days} дн</b>
                <span className="text-muted-2">· тариф</span>
                <b className="tabular-nums">{dailyRate} ₽/сут</b>
                <span className="text-muted-2">· ИТОГО</span>
                <b className="tabular-nums">{fmtNum(rental.sum)} ₽</b>
              </div>
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="font-semibold text-blue-700">Стало:</span>
                <b className="tabular-nums text-blue-700">
                  {editPreview.days} дн
                </b>
                <span className="text-muted-2">· тариф</span>
                <b className="tabular-nums text-blue-700">
                  {editPreview.rate} ₽/сут
                </b>
                <span className="text-muted-2">· ИТОГО</span>
                <b className="tabular-nums text-blue-700">
                  {fmtNum(editPreview.sum)} ₽
                </b>
              </div>
              {editPreview.sum !== rental.sum && (
                <div
                  className={cn(
                    "mt-0.5 text-[11.5px] font-semibold",
                    editPreview.sum > rental.sum
                      ? "text-emerald-700"
                      : "text-red-ink",
                  )}
                >
                  Разница: {editPreview.sum > rental.sum ? "+" : "−"}
                  {fmtNum(Math.abs(editPreview.sum - rental.sum))} ₽
                </div>
              )}
            </div>
          )}
          {/* F1: переключатель тарифа — оператор вручную выбирает ступень
              (₽/сут из сетки модели); дни/сумма/остаток пересчитываются вживую,
              а «куда уходит остаток» спрашивается на «Зафиксировать». */}
          {editPreview && rateForTariff && (
            <div className="mt-2 border-t border-blue-200/70 pt-2">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700/80">
                  Тариф
                </span>
                {tariffOverride && (
                  <button
                    type="button"
                    onClick={() => setTariffOverride(null)}
                    className="text-[10px] font-semibold text-blue-700/70 underline-offset-2 hover:underline"
                  >
                    сбросить (авто)
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(["short", "week", "month"] as const).map((t) => {
                  const r = rateForTariff(t);
                  // Активна ступень, чью ставку показываем (ручной выбор —
                  // напрямую; авто — сопоставляем по ₽/сут, т.к. ставка ветки
                  // могла быть зафиксирована не по числу дней).
                  const active = tariffOverride
                    ? tariffOverride === t
                    : editPreview.rate === r;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTariffOverride(active ? null : t)}
                      title={`Тариф «${TARIFF_PERIOD_LABEL[t]}» — ${r} ₽/сут`}
                      className={cn(
                        "flex flex-col items-start rounded-lg border px-2 py-1 text-left transition-colors",
                        active
                          ? "border-blue-500 bg-blue-100 text-blue-800 ring-1 ring-blue-300"
                          : "border-border bg-surface text-ink-2 hover:border-blue-300",
                      )}
                    >
                      <span className="text-[10px] font-semibold leading-tight">
                        {TARIFF_PERIOD_LABEL[t]}
                      </span>
                      <span className="text-[11px] font-bold tabular-nums leading-tight">
                        {fmtNum(r)} ₽/сут
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* v0.7.12: десктоп — сетка календаря СЛЕВА, timeline дат СПРАВА.
          Мобайл (<sm): вертикальный стек — выдано/возврат СТРОКОЙ сверху,
          календарь на ВСЮ ширину, легенда СТРОКОЙ снизу. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* Мобайл: выдано / возврат — компактной строкой над календарём. */}
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-soft px-3.5 py-2.5 sm:hidden">
          <div className="text-[12px]">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-2">
              Выдано
            </div>
            <div className="font-bold text-ink">{rental.start}</div>
          </div>
          <div className="h-px flex-1 bg-border" />
          <div className="text-right text-[12px]">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-2">
              Возврат
            </div>
            <div className={cn("font-bold", isOverdue ? "text-red-ink" : "text-ink")}>
              {rental.endPlanned}
            </div>
          </div>
        </div>

        {startIso && endIso && calEndIso && (
          <div
            ref={calendarBoxRef}
            // Мобайл — на всю ширину блока; десктоп — ограничиваем ~380px.
            // v0.6.50: в режиме «Изменить период» календарь ОСТАЁТСЯ
            // интерактивным — новую дату возврата кликают прямо на нём
            // (текущий период приглушается внутри календаря, editDim-зоной).
            className="min-w-0 w-full sm:max-w-[380px] sm:flex-1 transition-opacity"
            style={{
              visibility: hideCalendar ? "hidden" : undefined,
            }}
          >
            <DragExtendCalendar
              startIso={startIso}
              plannedEndIso={calEndIso}
              isOverdue={isOverdue}
              dailyRate={dailyRate}
              onCommitExtend={onCommitExtend}
              resetSignal={resetSignal}
              disabled={dragDisabled}
              initialDays={initialExtDays}
              hideLegend
              parkingMode={parkingMode}
              parkingRanges={parkingRanges}
              parkingOccupiedRanges={parkingOccupiedRanges}
              onParkingPick={handleParkingPick}
              onParkingHover={(iso) => setParkingHoverEnd(iso)}
              parkingSelectableFromIso={selFrom}
              parkingSelectableToIso={selTo}
              editPeriodMode={editMode}
              editEndIso={editEndIso}
              onEditPeriodPick={(iso) => setEditEndIso(iso)}
              editMinReturnIso={editMinEndIso}
              editDimFromIso={editDimFromIso}
              paymentDateIso={paymentDateIso}
            />
          </div>
        )}

        {/* Десктоп: правый столбик с timeline дат и вертикальной легендой. */}
        <div className="hidden w-[150px] shrink-0 sm:block">
          <DateTimeline
            startDate={rental.start}
            startTime={rental.startTime ?? "12:00"}
            endDate={rental.endPlanned}
            endTime={rental.startTime ?? "12:00"}
            overdue={isOverdue}
            overdueDays={overdueDays}
          />
          <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3 text-[11.5px] text-muted-2">
            <CalendarLegend
              isOverdue={isOverdue}
              showParking={parkingMode || sessions.length > 0}
            />
          </div>
        </div>

        {/* Мобайл: легенда — строкой (с переносом) под календарём. */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3 text-[11.5px] text-muted-2 sm:hidden">
          <CalendarLegend
            isOverdue={isOverdue}
            showParking={parkingMode || sessions.length > 0}
          />
        </div>
      </div>
    </div>
  );
}

/** Набор точек-легенды календаря (используется и в столбике, и в строке). */
function CalendarLegend({
  isOverdue,
  showParking,
}: {
  isOverdue: boolean;
  showParking: boolean;
}) {
  return (
    <>
      <LegendDot swatch="bg-blue-400" label="выдача" />
      <LegendDot swatch="bg-blue-300" label="оплачено" />
      {isOverdue && <LegendDot swatch="bg-red-400" label="просрочка" />}
      <LegendDot swatch="bg-emerald-400" label="продление" />
      {showParking && <LegendDot swatch="bg-yellow-400" label="паркинг" />}
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "inline-block h-2.5 w-2.5 rounded-full border-2 bg-transparent",
            isOverdue ? "border-red-500" : "border-blue-500",
          )}
        />
        <span>возврат</span>
      </div>
    </>
  );
}

function LegendDot({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("inline-block h-2 w-2 rounded-full", swatch)} />
      <span>{label}</span>
    </div>
  );
}

/**
 * v0.7.12: вертикальный timeline «Выдано → Возврат» справа от календаря.
 * Точки: выдача — синяя, возврат — красная при просрочке, иначе тёмная.
 * Между точками — вертикальная линия. Дата крупнее, время мельче под ней.
 * БЕЗ склада (его нет).
 */
function DateTimeline({
  startDate,
  startTime,
  endDate,
  endTime,
  overdue,
  overdueDays,
}: {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  overdue?: boolean;
  overdueDays?: number;
}) {
  return (
    <div className="pt-1">
      {/* Выдача — синий залитый круг (старт). */}
      <TimelinePoint
        label="Выдано"
        date={startDate}
        time={startTime}
        dotClass="bg-blue-500"
        connector
      />
      {/* v0.7.13: Возврат — круг с обводкой БЕЗ заливки. Синий обычный /
          красный при просрочке. */}
      <TimelinePoint
        label="Возврат"
        date={endDate}
        time={endTime}
        dotClass={cn(
          "bg-transparent border-2",
          overdue ? "border-red-500" : "border-blue-500",
        )}
        sub={
          overdue ? (
            <span className="text-[10.5px] font-semibold text-red-ink">
              просрочен на {overdueDays} дн
            </span>
          ) : undefined
        }
      />
    </div>
  );
}

function TimelinePoint({
  label,
  date,
  time,
  dotClass,
  connector,
  sub,
}: {
  label: string;
  date: string;
  time: string;
  dotClass: string;
  /** Рисовать вертикальную линию вниз от точки (для верхнего пункта). */
  connector?: boolean;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5">
      {/* Колонка с точкой и линией */}
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-surface",
            dotClass,
          )}
        />
        {connector && <span className="my-1 w-px flex-1 bg-border" />}
      </div>
      {/* Контент */}
      <div className={cn("min-w-0", connector ? "pb-3" : "")}>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">
          {label}
        </div>
        <div className="mt-0.5 font-display text-[15px] font-bold leading-tight text-ink tabular-nums">
          {date}
        </div>
        <div className="text-[12px] text-muted tabular-nums">{time}</div>
        {sub && <div className="mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}
