/**
 * v0.6.9 — Floating month-grid календарь для PaymentAcceptDialog.
 *
 * Заменяет компактную «полоску ячеек» из CompactExtendCalendar:
 * показывает полноценный месячный grid (как RentalPeriodCalendar из
 * @/components/ui/date-picker), но с тремя цветовыми зонами вместо
 * двух (там сине-красный read-only):
 *
 *   · СИНИЙ      — текущая аренда (startDate ≤ d ≤ anchor)
 *   · ЗЕЛЁНЫЙ   — продление, покрытое деньгами (greenStart < d ≤ coveredEnd)
 *   · ОРАНЖЕВЫЙ — продление, на которое не хватает (только в mode='amount')
 *   · КРАСНЫЙ   — хвост просрочки (anchor < d ≤ today) если не forgive
 *
 * Размер ячеек: size-11 (44×44) с шрифтом 14.5px — пропорционально больше,
 * чем size-9 (36×36) в RentalPeriodCalendar карточки.
 *
 * Анимация выезжания — на стороне обёртки в PaymentAcceptDialog
 * (animate-slide-in-down / animate-slide-out-up). Этот компонент рендерит
 * только содержимое, без позиционирования.
 */

import {
  CalendarDate,
  getLocalTimeZone,
  today,
} from "@internationalized/date";
import {
  Button,
  Calendar as CalendarRacBase,
  CalendarCell as CalendarCellRac,
  CalendarGrid as CalendarGridRac,
  CalendarGridBody as CalendarGridBodyRac,
  CalendarGridHeader as CalendarGridHeaderRac,
  CalendarHeaderCell as CalendarHeaderCellRac,
  Heading as HeadingRac,
  I18nProvider,
} from "react-aria-components";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function dateToCal(d: Date): CalendarDate {
  return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function CalendarHeaderInner({ title }: { title: string }) {
  return (
    <header className="flex w-full items-center gap-1 pb-1.5">
      <Button
        slot="previous"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-2 outline-offset-2 transition-colors hover:bg-blue-50 hover:text-blue-700 focus:outline-none data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-blue-200"
      >
        <ChevronLeft size={18} strokeWidth={2} />
      </Button>
      <div className="grow text-center">
        <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
          {title}
        </div>
        <HeadingRac className="mt-0.5 text-[15px] font-semibold capitalize text-ink" />
      </div>
      <Button
        slot="next"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-2 outline-offset-2 transition-colors hover:bg-blue-50 hover:text-blue-700 focus:outline-none data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-blue-200"
      >
        <ChevronRight size={18} strokeWidth={2} />
      </Button>
    </header>
  );
}

export function PaymentAcceptCalendar({
  startDate,
  anchor,
  today: todayDate,
  newEnd,
  hasOverdue,
  forgiveDebt,
  coveredDays,
  extDays,
}: {
  /** Дата выдачи аренды. */
  startDate: Date;
  /** Плановый возврат (endPlanned) — конец синей зоны. */
  anchor: Date;
  /** Сегодня — для подсвета красной зоны (просрочка). */
  today: Date;
  /** Конец продления (newEnd) — последняя зелёная/оранжевая ячейка. */
  newEnd: Date;
  /** Есть ли просрочка (anchor < today). */
  hasOverdue: boolean;
  /** Прощаем ли просрочку (если да — красную зону не подсвечиваем). */
  forgiveDebt: boolean;
  /** Сколько дней продления покрыто деньгами (для amount-mode). */
  coveredDays: number;
  /** Общее число дней продления. */
  extDays: number;
}) {
  const tz = getLocalTimeZone();
  const now = today(tz);
  const start = dateToCal(startDate);
  const planned = dateToCal(anchor);
  const todayCal = dateToCal(todayDate);
  const end = dateToCal(newEnd);

  // Зелёная зона начинается с anchor+1 или today+1 (если есть просрочка).
  const greenStart = hasOverdue ? todayCal : planned;
  // День, до которого зелёный покрывает (coveredDays штук после greenStart).
  // Если coveredDays=0 и extDays>0 — оранжевая зона начинается прямо
  // с greenStart+1.
  const showAmountShortage = coveredDays < extDays;
  // Фокус месяца: где «активность» — обычно anchor / today / newEnd.
  // Открываем на месяце, где есть зелёная/оранжевая зона.
  const focus = greenStart.compare(end) <= 0 ? greenStart : planned;

  return (
    <div className="rounded-2xl border border-border bg-white p-3 shadow-card-lg">
      <I18nProvider locale="ru-RU">
        <CalendarRacBase
          aria-label="Период аренды и продления"
          isReadOnly
          defaultFocusedValue={focus}
        >
          <CalendarHeaderInner title="Период аренды и продления" />
          <CalendarGridRac className="[&_th]:px-0 [&_td]:px-0">
            <CalendarGridHeaderRac>
              {(day) => (
                <CalendarHeaderCellRac className="h-9 w-11 rounded-lg p-0 text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                  {day}
                </CalendarHeaderCellRac>
              )}
            </CalendarGridHeaderRac>
            <CalendarGridBodyRac>
              {(date) => {
                const inRental =
                  date.compare(start) >= 0 && date.compare(planned) <= 0;
                const inOverdueTail =
                  hasOverdue &&
                  !forgiveDebt &&
                  date.compare(planned) > 0 &&
                  date.compare(todayCal) <= 0;
                // Зелёная: greenStart < date ≤ end, и оплачено
                const inExtension =
                  extDays > 0 &&
                  date.compare(greenStart) > 0 &&
                  date.compare(end) <= 0;
                // Сколько «дней продления» от greenStart до этой даты
                const dayOffset = inExtension
                  ? date.compare(greenStart)
                  : 0;
                const isCoveredExtension =
                  inExtension && dayOffset <= coveredDays;
                const isUncoveredExtension =
                  inExtension &&
                  showAmountShortage &&
                  dayOffset > coveredDays;
                const isStart = date.compare(start) === 0;
                const isPlanned = date.compare(planned) === 0;
                const isToday = date.compare(now) === 0;
                const isNewEnd = date.compare(end) === 0 && extDays > 0;

                // Цветовые слои (порядок важен — позже перекрывает раньше).
                const classes: string[] = [];
                if (inRental && !isStart && !isPlanned) {
                  classes.push("bg-blue-100 text-blue-900");
                }
                if (isStart) {
                  classes.push("rounded-s-lg bg-blue-600 text-white");
                }
                if (isPlanned) {
                  if (hasOverdue && !forgiveDebt) {
                    classes.push("bg-blue-600 text-white");
                  } else if (inExtension) {
                    classes.push("bg-blue-600 text-white");
                  } else {
                    classes.push("rounded-e-lg bg-blue-600 text-white");
                  }
                }
                if (inOverdueTail) {
                  classes.push("bg-red-100 text-red-900");
                }
                if (isCoveredExtension && !isNewEnd) {
                  classes.push("bg-emerald-100 text-emerald-900");
                }
                if (isUncoveredExtension && !isNewEnd) {
                  classes.push(
                    "bg-orange-100 text-orange-900 border border-dashed border-orange-300",
                  );
                }
                if (isNewEnd) {
                  if (isUncoveredExtension) {
                    classes.push(
                      "rounded-e-lg bg-orange-500 text-white",
                    );
                  } else {
                    classes.push(
                      "rounded-e-lg bg-emerald-600 text-white",
                    );
                  }
                }

                return (
                  <CalendarCellRac
                    date={date}
                    className={cn(
                      "relative flex h-11 w-11 items-center justify-center whitespace-nowrap p-0 text-[14.5px] font-medium text-ink",
                      ...classes,
                      // Точка «сегодня»
                      isToday &&
                        !isNewEnd &&
                        !isStart &&
                        !isPlanned &&
                        "after:pointer-events-none after:absolute after:bottom-1 after:left-1/2 after:z-10 after:h-[4px] after:w-[4px] after:-translate-x-1/2 after:rounded-full after:bg-ink",
                    )}
                  />
                );
              }}
            </CalendarGridBodyRac>
          </CalendarGridRac>
        </CalendarRacBase>
      </I18nProvider>

      {/* Bottom legend */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border pt-2 text-[11.5px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
          аренда
        </span>
        {hasOverdue && !forgiveDebt && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            просрочка
          </span>
        )}
        {extDays > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            продление
          </span>
        )}
        {showAmountShortage && extDays > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
            не хватает
          </span>
        )}
      </div>
    </div>
  );
}
