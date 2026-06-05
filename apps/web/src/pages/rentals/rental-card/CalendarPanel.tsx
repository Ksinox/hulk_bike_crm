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
import { useMemo, useState, type Ref } from "react";
import { CalendarCog, SquareParking, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DragExtendCalendar } from "./DragExtendCalendar";
import {
  MIN_RENTAL_DAYS,
  periodForDays,
  ratePeriodForDays,
  type Rental,
  type RentalStatus,
  type TariffPeriod,
} from "@/lib/mock/rentals";
import {
  useRentalParking,
  useCreateParking,
  useEndParking,
  useDeleteParking,
  PARKING_MAX_DAYS,
} from "@/lib/api/parking";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api";

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
  previewRate,
  calendarBoxRef,
  hideCalendar,
  resetSignal,
  initialExtDays,
  armParkingSignal,
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
  }) => void;
  /**
   * v0.6.50: ставка ₽/сут для N дней по тарифной сетке модели аренды.
   * Резолвится в RentalCard (useModelRateResolver). Используется в превью
   * «Изменить период» и при фиксации нового sum.
   */
  previewRate?: (days: number) => number;
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
  // v0.8.27 (G4): паркинг открытый — выбираем только дату начала; конец
  // определяется ручным/авто снятием. Тумблер «первый день бесплатно».
  const [freeFirstDay, setFreeFirstDay] = useState(true);

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
  const exitEdit = () => {
    setEditMode(false);
    setEditEndIso(null);
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
  };

  // Минимально допустимая дата возврата: сдвиг от ТЕКУЩЕГО возврата назад
  // так, чтобы осталось не меньше MIN_RENTAL_DAYS дней аренды. Считаем от
  // endIso (а не от startIso), потому что у аренды с паркингом/правками
  // дата возврата ≠ старт + дни (паркинг сдвигает возврат, не добавляя
  // оплачиваемых дней).
  const editMinEndIso = endIso
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
  // Пересчёт: новое число дней = текущие дни аренды + сдвиг даты возврата
  // относительно ТЕКУЩЕГО возврата (а не абсолютный span старт→возврат).
  // Так паркинг/правки не превращаются в оплачиваемые дни: подвинули
  // возврат на −3 дня → на 3 дня меньше аренды. days → tier → rate → sum.
  const editPreview = useMemo(() => {
    if (!editMode || !endIso || !editEndIso || !previewRate) return null;
    const deltaDays = signedDiffDays(endIso, editEndIso);
    const days = Math.max(MIN_RENTAL_DAYS, rental.days + deltaDays);
    const newTier = ratePeriodForDays(days);
    const oldTier = ratePeriodForDays(rental.days);
    // Ставка: если тарифная ступень НЕ изменилась — сохраняем текущую
    // дневную ставку аренды (не нормализуем к каталожной — иначе открытие
    // без правок показывало бы ложную разницу и стирало возможную скидку).
    // При смене ступени — берём ставку новой ступени из каталога.
    const rate = newTier === oldTier ? dailyRate : previewRate(days);
    const sum = (rate + equipmentDaily) * days;
    const tariffPeriod = periodForDays(days) as Exclude<TariffPeriod, "day">;
    return { days, rate, sum, tariffPeriod, ratePeriod: newTier };
  }, [editMode, endIso, editEndIso, previewRate, equipmentDaily, rental.days, dailyRate]);

  const commitEdit = () => {
    if (!editPreview || !editEndIso || !endIso) return;
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
    const opts = {
      onSuccess: () => toast.success("Снят с паркинга", "Возврат пересчитан"),
      onError: () => toast.error("Не удалось снять с паркинга"),
    };
    // Уже начавшийся паркинг — закрываем сегодня (end); будущий — удаляем.
    if (activeSession.startDate <= todayIso()) endParking.mutate(args, opts);
    else deleteParking.mutate(args, opts);
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
    if (draftStart) ranges.push({ startIso: draftStart, endIso: draftStart });
    return ranges;
  }, [sessions, draftStart]);

  // F3: периоды УЖЕ существующих сессий (без черновика) — их дни нельзя
  // выбрать повторно. Один день не может попасть в паркинг дважды.
  const parkingOccupiedRanges = useMemo(
    () => sessions.map((s) => ({ startIso: s.startDate, endIso: s.endDate })),
    [sessions],
  );

  // Окно выбора: начало паркинга не раньше выдачи; конец открыт.
  const selFrom = startIso;
  const selTo: string | null = null;

  const handleParkingPick = (iso: string) => {
    setDraftStart(iso);
  };

  const exitParking = () => {
    setParkingMode(false);
    setDraftStart(null);
    setFreeFirstDay(true);
  };

  const toggleParkingButton = () => {
    if (!parkingMode) {
      // Взаимоисключение с «Изменить период».
      setEditMode(false);
      setEditEndIso(null);
      setParkingMode(true);
      setDraftStart(null);
      setFreeFirstDay(true);
      return;
    }
    // повторный клик = зафиксировать (нужна выбранная дата начала)
    if (draftStart) {
      createParking.mutate(
        { rentalId: rental.id, startDate: draftStart, freeFirstDay },
        {
          onSuccess: () => {
            toast.success(
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
                    onClick={enterEdit}
                    title="Изменить период (перевыбрать дату возврата)"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[12px] font-semibold text-ink shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 active:scale-[0.98]"
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
                {!parkingMode && activeSession ? (
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
              <button
                type="button"
                onClick={toggleParkingButton}
                disabled={parkingMode && !draftStart}
                title={
                  parkingMode ? "Зафиксировать паркинг" : "Поставить на паркинг"
                }
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold shadow-sm transition-colors active:scale-[0.98] disabled:opacity-60",
                  parkingMode
                    ? draftStart
                      ? "border-yellow-500 bg-yellow-400 text-yellow-950 hover:bg-yellow-500"
                      : "border-yellow-300 bg-yellow-100 text-yellow-800"
                    : "border-yellow-300 bg-yellow-100 text-yellow-900 hover:border-yellow-400 hover:bg-yellow-200",
                )}
              >
                <SquareParking size={14} />
                {parkingMode
                  ? draftStart
                    ? "Зафиксировать"
                    : "Выберите дату"
                  : "Поставить на паркинг"}
              </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* v0.8.28 (H6): сводка открытого паркинга. Тумблер «1-й день бесплатно»
          убран с карточки — все расчёты происходят на этапе «Принять оплату». */}
      {parkingMode && (
        <div className="mb-2.5 rounded-[10px] border border-yellow-300 bg-yellow-50 px-3 py-2 text-[12px] text-yellow-900">
          {!draftStart ? (
            <span>
              🅿 Выберите <b>дату начала</b> паркинга. Идёт до снятия вручную
              (или авто через {PARKING_MAX_DAYS} дн).
            </span>
          ) : (
            <span>
              Старт <b>{isoToShort(draftStart)}</b> · идёт до снятия ·{" "}
              1-й день бесплатно, далее 250 ₽/сут
            </span>
          )}
        </div>
      )}

      {/* v0.6.50: «Изменить период» правится ПРЯМО на календаре — новую дату
          возврата оператор кликает на той же сетке (текущий период там
          приглушён). Здесь — только компактная сводка НАД календарём:
          пока ничего не выбрано — подсказка «кликните дату»; после клика —
          сводка было→стало. Стиль как у блока-сводки паркинга. */}
      {editMode && (
        <div className="mb-2.5 rounded-[10px] border border-blue-200 bg-blue-50/70 px-3 py-2">
          {!editPreview ? (
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
              parkingSelectableFromIso={selFrom}
              parkingSelectableToIso={selTo}
              editPeriodMode={editMode}
              editEndIso={editEndIso}
              onEditPeriodPick={(iso) => setEditEndIso(iso)}
              editMinReturnIso={editMinEndIso}
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
