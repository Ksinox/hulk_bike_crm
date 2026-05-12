/**
 * CalendarPanel — левая часть нижнего ряда v0.6 карточки. Показывает:
 *   • Блок «Выдача» (дата + время)
 *   • Блок «Возврат» (план или просрочка, дата + время)
 *   • Месячный календарь с подсветкой периода (синий) и хвоста просрочки (красный)
 *
 * v0.6 Phase 2 start: drag-to-extend ещё НЕ реализован — только статический
 * RentalPeriodCalendar в режиме read-only. Drag-зона и preview зелёных
 * дней — в следующей итерации (Phase 2.5).
 */
import { Calendar, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { RentalPeriodCalendar } from "@/components/ui/date-picker";
import type { Rental, RentalStatus } from "@/lib/mock/rentals";

/** DD.MM.YYYY → YYYY-MM-DD */
function ruToIso(ru: string | undefined | null): string | null {
  if (!ru) return null;
  const m = ru.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function diffDays(fromRu: string | undefined, toRu: string | undefined): number {
  if (!fromRu || !toRu) return 0;
  const f = ruToIso(fromRu);
  const t = ruToIso(toRu);
  if (!f || !t) return 0;
  const a = new Date(f).getTime();
  const b = new Date(t).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function CalendarPanel({
  rental,
  effectiveStatus,
}: {
  rental: Rental;
  effectiveStatus: RentalStatus;
}) {
  const startIso = ruToIso(rental.start);
  const endIso = ruToIso(rental.endPlanned);
  const isOverdue = effectiveStatus === "overdue";
  const overdueUntilIso = isOverdue ? todayIso() : null;
  const total = diffDays(rental.start, rental.endPlanned);
  const overdueDays = isOverdue
    ? diffDays(rental.endPlanned, todayIso().split("-").reverse().join(".").replace(/^(\d{2})-(\d{2})-(\d{4})$/, "$3.$2.$1"))
    : 0;

  // Workaround: чтобы посчитать дни просрочки между endPlanned и today
  const computedOverdueDays = (() => {
    if (!isOverdue || !endIso) return 0;
    const today = new Date(todayIso()).getTime();
    const planned = new Date(endIso).getTime();
    return Math.max(0, Math.round((today - planned) / 86400000));
  })();
  void overdueDays;

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
          overdueDays={computedOverdueDays}
        />
      </div>
      {startIso && endIso && (
        <RentalPeriodCalendar
          startIso={startIso}
          plannedEndIso={endIso}
          overdueUntilIso={overdueUntilIso}
        />
      )}
      <div className="mt-3 pt-3 border-t border-border text-[10.5px] text-muted-2">
        v0.6 · drag-to-extend появится в следующей итерации. Сейчас календарь —
        только для просмотра. Для продления используйте «Принять оплату».
      </div>
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
