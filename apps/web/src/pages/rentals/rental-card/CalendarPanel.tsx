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
import { SquareParking, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DragExtendCalendar } from "./DragExtendCalendar";
import type { Rental, RentalStatus } from "@/lib/mock/rentals";
import {
  useRentalParking,
  useCreateParking,
  useEndParking,
  useDeleteParking,
  PARKING_MAX_DAYS,
} from "@/lib/api/parking";
import { toast } from "@/lib/toast";

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

export function CalendarPanel({
  rental,
  effectiveStatus,
  onCommitExtend,
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
          onError: () => toast.error("Не удалось поставить на паркинг"),
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
          <div className="flex items-center gap-1">
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
          </div>
        )}
      </div>

      {/* v0.8.27: сводка открытого паркинга + тумблер «1-й день бесплатно». */}
      {parkingMode && (
        <div className="mb-2.5 flex flex-col gap-2 rounded-[10px] border border-yellow-300 bg-yellow-50 px-3 py-2 text-[12px] text-yellow-900">
          {!draftStart ? (
            <span>
              🅿 Выберите <b>дату начала</b> паркинга. Идёт до снятия вручную
              (или авто через {PARKING_MAX_DAYS} дн).
            </span>
          ) : (
            <span>
              Старт <b>{isoToShort(draftStart)}</b> · идёт до снятия ·{" "}
              {freeFirstDay ? "1-й день 0 ₽ + " : ""}250 ₽/сут
            </span>
          )}
          {/* Тумблер «первый день бесплатно» (как в iOS). */}
          <button
            type="button"
            onClick={() => setFreeFirstDay((v) => !v)}
            className="flex items-center justify-between gap-2 text-[12px]"
          >
            <span>Первый день бесплатно</span>
            <span
              className={cn(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                freeFirstDay ? "bg-green-500" : "bg-border",
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                  freeFirstDay ? "translate-x-4" : "translate-x-0.5",
                )}
              />
            </span>
          </button>
        </div>
      )}

      {/* v0.7.12: сетка календаря СЛЕВА, вертикальный timeline дат СПРАВА. */}
      <div className="flex items-start gap-3">
        {startIso && endIso && calEndIso && (
          <div
            ref={calendarBoxRef}
            // v0.7.9: ограничиваем ширину сетки месяца (~380px).
            className="min-w-0 flex-1 max-w-[380px]"
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
              onParkingPick={handleParkingPick}
              parkingSelectableFromIso={selFrom}
              parkingSelectableToIso={selTo}
            />
          </div>
        )}
        <div className="w-[150px] shrink-0">
          <DateTimeline
            startDate={rental.start}
            startTime={rental.startTime ?? "12:00"}
            endDate={rental.endPlanned}
            endTime={rental.startTime ?? "12:00"}
            overdue={isOverdue}
            overdueDays={overdueDays}
          />
          {/* v0.7.13: легенда компактно под timeline в правом столбике. */}
          <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3 text-[11.5px] text-muted-2">
            <LegendDot swatch="bg-blue-400" label="выдача" />
            <LegendDot swatch="bg-blue-300" label="оплачено" />
            {isOverdue && <LegendDot swatch="bg-red-400" label="просрочка" />}
            <LegendDot swatch="bg-emerald-400" label="продление" />
            {(parkingMode || sessions.length > 0) && (
              <LegendDot swatch="bg-yellow-400" label="паркинг" />
            )}
            {/* образец «день возврата» — круг с обводкой (синий/красный) */}
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-block h-2.5 w-2.5 rounded-full border-2 bg-transparent",
                  isOverdue ? "border-red-500" : "border-blue-500",
                )}
              />
              <span>возврат</span>
            </div>
          </div>
        </div>
      </div>
    </div>
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
