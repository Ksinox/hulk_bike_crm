"use client";

/**
 * Календарь и Range-календарь на react-aria-components, адаптированные
 * под палитру Халк Байк CRM:
 *   - выбранные ячейки: bg-ink (синий ink) / text-white (как кнопки CTA)
 *   - hover: bg-blue-50
 *   - сегодняшний день: точка снизу bg-ink (или белая на выбранных)
 *   - бордер/спокойный фон: border-border / bg-surface / bg-surface-soft
 *
 * Иконки навигации — lucide-react (тот же ChevronLeft/Right что в остальной CRM).
 *
 * Локализация и формат дат подтягиваются автоматически от обёртки
 * <I18nProvider locale="ru-RU"> в DateRangeFilter — поэтому шапка месяца
 * выводится как «июль 2026», подписи дней — «пн / вт / ср / …».
 */

import { cn } from "@/lib/utils";
import { getLocalTimeZone, today } from "@internationalized/date";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ComponentProps } from "react";
import {
  Button,
  CalendarCell as CalendarCellRac,
  CalendarGridBody as CalendarGridBodyRac,
  CalendarGridHeader as CalendarGridHeaderRac,
  CalendarGrid as CalendarGridRac,
  CalendarHeaderCell as CalendarHeaderCellRac,
  Calendar as CalendarRac,
  Heading as HeadingRac,
  RangeCalendar as RangeCalendarRac,
  composeRenderProps,
} from "react-aria-components";

interface BaseCalendarProps {
  className?: string;
}

type CalendarProps = ComponentProps<typeof CalendarRac> & BaseCalendarProps;
type RangeCalendarProps = ComponentProps<typeof RangeCalendarRac> &
  BaseCalendarProps;

const CalendarHeader = () => (
  <header className="flex w-full items-center gap-1 pb-1">
    <Button
      slot="previous"
      className="flex size-9 items-center justify-center rounded-lg text-muted-2 outline-offset-2 transition-colors hover:bg-blue-50 hover:text-blue-700 focus:outline-none data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-blue-200"
    >
      <ChevronLeft size={16} strokeWidth={2} />
    </Button>
    <HeadingRac className="grow text-center text-[13px] font-semibold capitalize text-ink" />
    <Button
      slot="next"
      className="flex size-9 items-center justify-center rounded-lg text-muted-2 outline-offset-2 transition-colors hover:bg-blue-50 hover:text-blue-700 focus:outline-none data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-blue-200"
    >
      <ChevronRight size={16} strokeWidth={2} />
    </Button>
  </header>
);

const CalendarGridComponent = ({ isRange = false }: { isRange?: boolean }) => {
  const now = today(getLocalTimeZone());

  return (
    <CalendarGridRac>
      <CalendarGridHeaderRac>
        {(day) => (
          <CalendarHeaderCellRac className="size-9 rounded-lg p-0 text-[10.5px] font-semibold uppercase tracking-wide text-muted-2">
            {day}
          </CalendarHeaderCellRac>
        )}
      </CalendarGridHeaderRac>
      <CalendarGridBodyRac className="[&_td]:px-0">
        {(date) => (
          <CalendarCellRac
            date={date}
            className={cn(
              // Базовое
              "relative flex size-9 items-center justify-center whitespace-nowrap rounded-lg border border-transparent p-0 text-[12.5px] font-medium text-ink outline-offset-2 duration-150 [transition-property:color,background-color,border-radius,box-shadow] focus:outline-none",
              // Состояния
              "data-[disabled]:pointer-events-none data-[unavailable]:pointer-events-none",
              "data-[hovered]:bg-blue-50 data-[hovered]:text-blue-700",
              "data-[selected]:bg-ink data-[selected]:text-white",
              "data-[unavailable]:line-through data-[disabled]:opacity-30 data-[unavailable]:opacity-30",
              "data-[focus-visible]:z-10 data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-blue-200",
              // Range-стили: выбранный диапазон — насыщенный голубой
              // (bg-blue-200, чтобы контрастировать с белым фоном
              // календаря — раньше был bg-blue-50, почти не видно),
              // концы (start/end) — насыщенный ink. Quadrants скруглены
              // только по концам, чтобы диапазон выглядел как лента.
              isRange &&
                "data-[selected]:rounded-none data-[selection-end]:rounded-e-lg data-[selection-start]:rounded-s-lg data-[selected]:bg-blue-200 data-[selected]:text-blue-900 data-[hovered]:data-[selected]:bg-blue-300 data-[selection-start]:[&:not([data-hover])]:bg-ink data-[selection-end]:[&:not([data-hover])]:bg-ink data-[selection-start]:[&:not([data-hover])]:text-white data-[selection-end]:[&:not([data-hover])]:text-white",
              // Маркер «сегодня» — точка под цифрой
              date.compare(now) === 0 &&
                cn(
                  "after:pointer-events-none after:absolute after:bottom-1 after:start-1/2 after:z-10 after:size-[3px] after:-translate-x-1/2 after:rounded-full after:bg-ink",
                  isRange
                    ? "data-[selection-end]:[&:not([data-hover])]:after:bg-white data-[selection-start]:[&:not([data-hover])]:after:bg-white"
                    : "data-[selected]:after:bg-white",
                ),
            )}
          />
        )}
      </CalendarGridBodyRac>
    </CalendarGridRac>
  );
};

export function Calendar({ className, ...props }: CalendarProps) {
  return (
    <CalendarRac
      {...props}
      className={composeRenderProps(className, (cls) => cn("w-fit", cls))}
    >
      <CalendarHeader />
      <CalendarGridComponent />
    </CalendarRac>
  );
}

export function RangeCalendar({ className, ...props }: RangeCalendarProps) {
  return (
    <RangeCalendarRac
      {...props}
      className={composeRenderProps(className, (cls) => cn("w-fit", cls))}
    >
      <CalendarHeader />
      <CalendarGridComponent isRange />
    </RangeCalendarRac>
  );
}
