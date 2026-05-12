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
import { Calendar, MapPin } from "lucide-react";
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
}: {
  rental: Rental;
  effectiveStatus: RentalStatus;
  /** Вызывается на mouse-up после drag, если выбрано > 0 дней. */
  onCommitExtend?: (days: number) => void;
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
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
          График аренды
        </div>
        <div className="text-[11.5px] text-muted">
          Срок этой аренды{" "}
          <span className="font-bold text-blue-700 tabular-nums">{total} дн</span>
        </div>
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
        <DragExtendCalendar
          startIso={startIso}
          plannedEndIso={endIso}
          isOverdue={isOverdue}
          dailyRate={dailyRate}
          onCommitExtend={onCommitExtend}
          disabled={dragDisabled}
        />
      )}
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
      <div className="mt-0.5 text-[11px] text-muted inline-flex items-center gap-1">
        <MapPin size={10} /> Склад
      </div>
    </div>
  );
}
