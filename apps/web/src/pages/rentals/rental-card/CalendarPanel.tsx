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
import { Calendar, HelpCircle } from "lucide-react";
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
  const total = startIso && endIso ? diffDaysIso(startIso, endIso) : 0;
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
      {/* v0.6.38: заголовок «Дата возврата» (раньше «График аренды») +
          иконка (?) с tooltip, объясняющим зоны календаря. */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-2">
          <Calendar size={11} />
          Дата возврата
          <span
            title="Календарь аренды: синяя зона — выданный период, красная — просрочка, зелёная — выбранное продление. Клик по дню после планового конца — продлить."
            className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-surface-soft text-muted-2 hover:bg-border hover:text-ink cursor-help"
            aria-label="Подсказка по зонам календаря"
          >
            <HelpCircle size={10} />
          </span>
        </div>
        <div className="text-[11.5px] text-muted">
          Срок этой аренды{" "}
          <span className="font-bold text-blue-700 tabular-nums">{total} дн</span>
        </div>
      </div>
      {/* v0.6.38: легенда зон календаря — поднята НАД ScheduleBlock'ами,
          по дизайн-референсу. */}
      <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted">
        <LegendDot swatch="bg-blue-200" label="выдача" />
        <LegendDot swatch="bg-blue-200" label="текущий период" />
        {isOverdue && <LegendDot swatch="bg-red-200" label="просрочка" />}
        <LegendDot swatch="bg-emerald-200" label="продление" />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <ScheduleBlock
          kind="out"
          date={rental.start}
          time={rental.startTime ?? "12:00"}
        />
        <ScheduleBlock
          kind="back"
          date={rental.endPlanned}
          time={rental.startTime ?? "12:00"}
          overdue={isOverdue}
          overdueDays={overdueDays}
        />
      </div>
      {startIso && endIso && (
        <div
          ref={calendarBoxRef}
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
    </div>
  );
}

function LegendDot({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className={cn("inline-block size-2.5 rounded-sm", swatch)} />
      <span>{label}</span>
    </div>
  );
}

function ScheduleBlock({
  kind,
  date,
  time,
  overdue,
  overdueDays,
}: {
  kind: "out" | "back";
  date: string;
  time: string;
  overdue?: boolean;
  overdueDays?: number;
}) {
  const isOut = kind === "out";
  return (
    <div
      className={cn(
        "rounded-[12px] border px-3 py-2.5",
        overdue && !isOut
          ? "border-red-soft bg-red-soft/40"
          : "border-border bg-surface-soft",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider",
          overdue && !isOut
            ? "text-red-ink"
            : isOut
              ? "text-blue-700"
              : "text-ink-2",
        )}
      >
        <Calendar size={11} />
        {isOut
          ? "Выдача"
          : overdue
            ? `Просрочен · ${overdueDays} дн`
            : "Возврат (план)"}
      </div>
      <div className="mt-1 font-display text-[15px] font-extrabold text-ink tabular-nums">
        {date} · {time}
      </div>
    </div>
  );
}
