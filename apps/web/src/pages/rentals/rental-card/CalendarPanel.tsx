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
import type { Ref } from "react";
import { cn } from "@/lib/utils";
import { DragExtendCalendar } from "./DragExtendCalendar";
import type { Rental, RentalStatus } from "@/lib/mock/rentals";

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

export function CalendarPanel({
  rental,
  effectiveStatus,
  onCommitExtend,
  calendarBoxRef,
  hideCalendar,
  resetSignal,
  initialExtDays,
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

  return (
    <div className="rounded-2xl bg-surface border border-border shadow-card-sm p-4">
      {/* v0.6.49: заголовок «ДАТА ВОЗВРАТА» — uppercase серым по эталону. */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-muted-2">
          Дата возврата
        </div>
      </div>
      {/* v0.6.49: легенда — простые цветные точки без рамок.
          v0.7.12: добавлен пункт «возврат» (тонкая обводка-рамка) —
          образец маркера дня планового возврата в сетке календаря. */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-[12px] text-muted-2">
        <LegendDot swatch="bg-blue-400" label="выдача" />
        <LegendDot swatch="bg-blue-300" label="оплачено" />
        {isOverdue && <LegendDot swatch="bg-red-400" label="просрочка" />}
        <LegendDot swatch="bg-emerald-400" label="продление" />
        {/* образец «день возврата» — рамка вместо заливки */}
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] ring-2 ring-inset ring-ink/40" />
          <span>возврат</span>
        </div>
      </div>
      {/* v0.7.12: сетка календаря СЛЕВА, вертикальный timeline дат СПРАВА
          (Выдано сверху → линия → Возврат снизу). Раньше Выдано/Возврат
          были двумя блоками в ряд НАД календарём. */}
      <div className="flex items-start gap-3">
        {startIso && endIso && (
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
              plannedEndIso={endIso}
              isOverdue={isOverdue}
              dailyRate={dailyRate}
              onCommitExtend={onCommitExtend}
              resetSignal={resetSignal}
              disabled={dragDisabled}
              initialDays={initialExtDays}
              hideLegend
            />
          </div>
        )}
        <DateTimeline
          startDate={rental.start}
          startTime={rental.startTime ?? "12:00"}
          endDate={rental.endPlanned}
          endTime={rental.startTime ?? "12:00"}
          overdue={isOverdue}
          overdueDays={overdueDays}
        />
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
    <div className="w-[150px] shrink-0 pt-1">
      {/* Выдано */}
      <TimelinePoint
        label="Выдано"
        date={startDate}
        time={startTime}
        dotClass="bg-blue-500"
        connector
      />
      {/* Возврат */}
      <TimelinePoint
        label="Возврат"
        date={endDate}
        time={endTime}
        dotClass={overdue ? "bg-red-500" : "bg-ink"}
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
