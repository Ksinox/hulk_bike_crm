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
  PARKING_MAX_DAYS,
  parkingAmount,
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

/** YYYY-MM-DD + n дней. */
function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
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

/** Кол-во суток в [a,b] включительно (iso). */
function inclusiveDaysIso(a: string, b: string): number {
  return diffDaysIso(a, b) + 1;
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
  const [parkingMode, setParkingMode] = useState(false);
  const [draftStart, setDraftStart] = useState<string | null>(null);
  const [draftEnd, setDraftEnd] = useState<string | null>(null);

  // Вход в режим по сигналу из ⋯-меню.
  const [seenArm, setSeenArm] = useState(armParkingSignal);
  if (armParkingSignal !== seenArm) {
    setSeenArm(armParkingSignal);
    if (armParkingSignal !== undefined && !dragDisabled) {
      setParkingMode(true);
      setDraftStart(null);
      setDraftEnd(null);
    }
  }

  const draftDays =
    draftStart && draftEnd ? inclusiveDaysIso(draftStart, draftEnd) : 0;

  // Эффективный возврат для календаря: базовый + дни черновика паркинга
  // (зафиксированные сессии уже сдвинули endPlanned на бэке).
  const calEndIso =
    endIso && draftDays > 0 ? addDaysIso(endIso, draftDays) : endIso;

  // Фиолетовые зоны: зафиксированные сессии + черновик (если выбран период).
  const parkingRanges = useMemo(() => {
    const ranges = sessions.map((s) => ({
      startIso: s.startDate,
      endIso: s.endDate,
    }));
    if (draftStart && draftEnd)
      ranges.push({ startIso: draftStart, endIso: draftEnd });
    return ranges;
  }, [sessions, draftStart, draftEnd]);

  // Окно выбора конца: от начала до начала+6 (≤7 суток).
  const selFrom = draftStart && !draftEnd ? draftStart : null;
  const selTo =
    draftStart && !draftEnd
      ? addDaysIso(draftStart, PARKING_MAX_DAYS - 1)
      : null;

  const handleParkingPick = (iso: string) => {
    if (!draftStart || (draftStart && draftEnd)) {
      // начинаем новый выбор
      setDraftStart(iso);
      setDraftEnd(null);
      return;
    }
    // есть начало, выбираем конец
    if (iso < draftStart) {
      setDraftStart(iso);
      setDraftEnd(null);
      return;
    }
    setDraftEnd(iso);
  };

  const exitParking = () => {
    setParkingMode(false);
    setDraftStart(null);
    setDraftEnd(null);
  };

  const toggleParkingButton = () => {
    if (!parkingMode) {
      setParkingMode(true);
      setDraftStart(null);
      setDraftEnd(null);
      return;
    }
    // повторный клик = зафиксировать выбранный период
    if (draftStart && draftEnd) {
      createParking.mutate(
        { rentalId: rental.id, startDate: draftStart, endDate: draftEnd },
        {
          onSuccess: () => {
            toast.success("Паркинг поставлен", "Возврат сдвинут");
            exitParking();
          },
          onError: () => toast.error("Не удалось поставить на паркинг"),
        },
      );
    } else {
      // ничего не выбрано — просто выходим из режима
      exitParking();
    }
  };

  const draftAmount = draftDays > 0 ? parkingAmount(draftDays) : 0;

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
            <button
              type="button"
              onClick={toggleParkingButton}
              disabled={parkingMode && !!draftStart && !draftEnd}
              title={
                parkingMode
                  ? "Зафиксировать паркинг"
                  : "Поставить на паркинг"
              }
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold transition-colors",
                parkingMode
                  ? draftStart && draftEnd
                    ? "bg-violet-600 text-white hover:bg-violet-700"
                    : "bg-violet-100 text-violet-700"
                  : "bg-violet-50 text-violet-700 hover:bg-violet-100",
              )}
            >
              <SquareParking size={14} />
              {parkingMode
                ? draftStart && draftEnd
                  ? "Зафиксировать"
                  : "Выберите период"
                : "Паркинг"}
            </button>
          </div>
        )}
      </div>

      {/* v0.8.0: подсказка/сводка режима паркинга над календарём. */}
      {parkingMode && (
        <div className="mb-2.5 rounded-[10px] border border-violet-200 bg-violet-50 px-3 py-2 text-[12px] text-violet-800">
          {!draftStart ? (
            <span>🅿 Выберите <b>начало</b> паркинга на календаре (макс {PARKING_MAX_DAYS} суток)</span>
          ) : !draftEnd ? (
            <span>
              Начало: <b>{isoToShort(draftStart)}</b> · теперь выберите{" "}
              <b>конец</b> (≤ {PARKING_MAX_DAYS} суток)
            </span>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span>
                Паркинг <b>{isoToShort(draftStart)}–{isoToShort(draftEnd)}</b> ·{" "}
                {draftDays} дн · 1-е беспл. + {Math.max(0, draftDays - 1)}×250 ={" "}
                <b>{draftAmount} ₽</b>
              </span>
              {calEndIso && (
                <span className="shrink-0 text-violet-700/80">
                  возврат → {isoToShort(calEndIso)}
                </span>
              )}
            </div>
          )}
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
              <LegendDot swatch="bg-violet-400" label="паркинг" />
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
