"use client";

/**
 * Унифицированные компоненты выбора даты для всей CRM (на базе
 * react-aria-components calendar). Заменяют сырые `<input type="text">
 * placeholder=ДД.ММ.ГГГГ` и `<input type="date">` — везде где UI просит
 * у пользователя дату или период:
 *
 *   - DatePicker        — одна дата (дата выдачи аренды, дата рождения
 *                         клиента, дата выдачи паспорта и т.п.)
 *   - DateRangePicker   — диапазон (период аренды, период просрочки,
 *                         фильтры по датам)
 *
 * Контракт значений — ISO `YYYY-MM-DD` (для совместимости с backend
 * Postgres `date`-колонками). Отображение — русское «ДД.ММ.ГГГГ».
 *
 * Календарь использует локаль `ru-RU` через I18nProvider, открывается
 * по клику на поле, закрывается по outside-клику.
 */

import { useEffect, useRef, useState } from "react";
import {
  CalendarDate,
  getLocalTimeZone,
  parseDate,
  today,
} from "@internationalized/date";
import type { DateRange } from "react-aria-components";
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
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Calendar, RangeCalendar } from "@/components/ui/calendar-rac";
import { cn } from "@/lib/utils";

/**
 * Шапка month-навигации для read-only календарей. Дублирует логику
 * CalendarHeader из calendar-rac.tsx — экспорта оттуда нет, чтобы не
 * раздувать API общего компонента ради одного потребителя.
 */
function CalendarHeaderInner() {
  return (
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
}

/* ================== utils ================== */

function isoToCalendarDate(iso: string | null): CalendarDate | null {
  if (!iso) return null;
  try {
    return parseDate(iso);
  } catch {
    return null;
  }
}

function calendarDateToIso(d: CalendarDate): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

function isoToRu(iso: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y}`;
}

/**
 * ru → ISO с проверкой реальности даты. Возвращает null если строка
 * частичная или невалидная (например 32.04.2026 / 15.13.2026 / 31.02.2026).
 * Учитывает високосные годы.
 */
function ruToIso(ru: string): string | null {
  const m = ru.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const day = Number(d);
  const month = Number(mo);
  const year = Number(y);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (year < 1900 || year > 2100) return null;
  return `${y}-${mo}-${d}`;
}

/** Сколько дней в указанном месяце (учитывает високосность). */
function daysInMonth(year: number, month: number): number {
  // new Date(year, month, 0) вернёт последний день предыдущего месяца —
  // т.е. в январе 2024 это будет 31 (декабрь 2023), и т.д. Но нам нужен
  // последний день ИМЕННО month — поэтому передаём month (1-based) как
  // есть, JS Date воспринимает month как 0-based, но `0`-day отбросит
  // на предыдущий → последний день нужного нам месяца.
  return new Date(year, month, 0).getDate();
}

/**
 * Автоформат при вводе руками: 12042026 → 12.04.2026
 *
 * Дополнительно «зажимает» цифры под валидные пределы по мере ввода,
 * чтобы юзер не мог вписать 35-й день или 13-й месяц:
 *   - первая цифра дня:   3 → ок (30/31), 4 и больше → 0
 *   - вторая цифра дня:   зависит от первой (3X → X≤1 если месяц
 *                         ещё не введён, иначе по дням-в-месяце)
 *   - первая цифра месяца: 1 → ок, 2 и больше → 0 (12 — последний)
 *   - вторая цифра месяца: 1X → X≤2; иначе 0-9
 *
 * Если уже введены DD и MM, проверяем что DD ≤ daysInMonth(YYYY ?? 2024, MM)
 * и при необходимости подрезаем DD.
 */
function formatRuInput(v: string): string {
  let raw = v.replace(/\D/g, "").slice(0, 8);

  // — день —
  if (raw.length >= 1) {
    const d1 = raw[0]!;
    if (Number(d1) > 3) raw = "0" + d1 + raw.slice(1);
  }
  if (raw.length >= 2) {
    const d1 = Number(raw[0]);
    const d2 = Number(raw[1]);
    // если первая цифра дня = 3, то вторая может быть только 0 или 1
    // (день 30/31 — точная проверка по dayInMonth ниже когда есть месяц)
    if (d1 === 3 && d2 > 1) raw = raw.slice(0, 1) + "1" + raw.slice(2);
    if (d1 === 0 && d2 === 0) raw = raw.slice(0, 1) + "1" + raw.slice(2);
  }

  // — месяц —
  if (raw.length >= 3) {
    const m1 = raw[2]!;
    if (Number(m1) > 1) raw = raw.slice(0, 2) + "0" + m1 + raw.slice(3);
  }
  if (raw.length >= 4) {
    const m1 = Number(raw[2]);
    const m2 = Number(raw[3]);
    if (m1 === 1 && m2 > 2) raw = raw.slice(0, 3) + "2" + raw.slice(4);
    if (m1 === 0 && m2 === 0) raw = raw.slice(0, 3) + "1" + raw.slice(4);
  }

  // — день относительно месяца (если месяц уже введён): обрезаем по
  //   количеству дней в этом месяце. Год возможно ещё не известен —
  //   используем 2024 как «високосный по умолчанию», чтобы не запретить
  //   29 февраля до завершения ввода года.
  if (raw.length >= 4) {
    const day = Number(raw.slice(0, 2));
    const month = Number(raw.slice(2, 4));
    const year =
      raw.length >= 8 ? Number(raw.slice(4, 8)) : 2024;
    const max = daysInMonth(year, month);
    if (day > max) {
      const fixed = String(max).padStart(2, "0");
      raw = fixed + raw.slice(2);
    }
  }

  if (raw.length <= 2) return raw;
  if (raw.length <= 4) return `${raw.slice(0, 2)}.${raw.slice(2)}`;
  return `${raw.slice(0, 2)}.${raw.slice(2, 4)}.${raw.slice(4)}`;
}

/* ================== DatePicker (одна дата) ================== */

type DatePickerProps = {
  /** ISO `YYYY-MM-DD` или null если не выбрано. */
  value: string | null;
  onChange: (next: string | null) => void;
  placeholder?: string;
  /** Вспомогательная дата «сейчас» — открыть календарь на этот месяц
   *  если value ещё не задан. По умолчанию — сегодня. */
  defaultMonth?: string;
  /** Заблокировать поле — не открывать календарь, показать выбранное readonly. */
  disabled?: boolean;
  /** Дополнительные классы (для разных высот input'а). */
  className?: string;
  /** Показать кнопку «×» сброса справа. */
  clearable?: boolean;
  /** id формы — нужно для <label htmlFor> в обёртывающих компонентах. */
  id?: string;
  /** Минимальная допустимая дата (ISO). Раньше — disabled. */
  minDate?: string;
  /** Максимальная допустимая дата (ISO). Позже — disabled. */
  maxDate?: string;
  /**
   * id следующего поля для автофокуса после полного ввода даты.
   * Аналогично паре «серия → номер» в паспортных полях: ввёл DD.MM.YYYY
   * полностью → курсор сам уехал дальше, без mouse'а.
   */
  nextFieldId?: string;
};

export function DatePicker({
  value,
  onChange,
  placeholder = "ДД.ММ.ГГГГ",
  defaultMonth,
  disabled,
  className,
  clearable = true,
  id,
  minDate,
  maxDate,
  nextFieldId,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(isoToRu(value));
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Когда значение меняется снаружи — синхронизируем текстовое поле.
  useEffect(() => {
    setText(isoToRu(value));
  }, [value]);

  // Закрытие по клику вне.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const handleTextBlur = () => {
    const iso = ruToIso(text);
    if (iso === null && text.trim() === "") {
      onChange(null);
      return;
    }
    if (iso !== null && iso !== value) {
      onChange(iso);
    }
  };

  // На какой месяц открыть календарь, если дата ещё не выбрана:
  // F8 — для даты рождения это НЕ «сегодня» (иначе листать к ~1990 десятки
  // раз), а defaultMonth (передаётся ~25 лет назад). Если value есть —
  // открываем на нём.
  const calValue =
    isoToCalendarDate(value) ??
    isoToCalendarDate(defaultMonth ?? null) ??
    today(getLocalTimeZone());

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          disabled={disabled}
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            const formatted = formatRuInput(e.target.value);
            setText(formatted);
            // Когда ввод стал полным DD.MM.YYYY (10 символов) — фиксируем
            // значение через onChange и переключаемся на nextField, как
            // в паре «серия / номер паспорта». Если nextFieldId не задан —
            // просто закрываем поповер; календарь у юзера и так открыт,
            // он мог уже навигировать кликом.
            if (formatted.length === 10) {
              const iso = ruToIso(formatted);
              if (iso !== null && iso !== value) onChange(iso);
              if (iso !== null && nextFieldId) {
                window.setTimeout(() => {
                  document.getElementById(nextFieldId)?.focus();
                  setOpen(false);
                }, 0);
              }
            }
          }}
          onBlur={handleTextBlur}
          onFocus={() => setOpen(true)}
          className={cn(
            "h-9 w-full rounded-[10px] border border-border bg-surface px-3 pr-9 text-[13px] text-ink outline-none transition-colors placeholder:text-muted-2 focus:border-blue-600",
            disabled && "cursor-not-allowed bg-surface-soft text-muted",
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-2 transition-colors hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed"
          title={value ? "Открыть календарь" : "Выбрать дату"}
        >
          {clearable && value ? (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-red-50 hover:text-red-ink"
              title="Очистить"
            >
              <X size={12} />
            </span>
          ) : (
            <CalendarDays size={14} />
          )}
        </button>
      </div>

      {open && !disabled && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 rounded-2xl border border-border bg-surface p-2 shadow-card-lg">
          <I18nProvider locale="ru-RU">
            <Calendar
              aria-label="Выбор даты"
              value={calValue}
              minValue={isoToCalendarDate(minDate ?? null) ?? undefined}
              maxValue={isoToCalendarDate(maxDate ?? null) ?? undefined}
              onChange={(d) => {
                if (d) {
                  onChange(calendarDateToIso(d as CalendarDate));
                  setOpen(false);
                }
              }}
            />
          </I18nProvider>
        </div>
      )}
    </div>
  );
}

/* ================== DateRangePicker ================== */

type DateRangePickerProps = {
  from: string | null;
  to: string | null;
  onChange: (next: { from: string | null; to: string | null }) => void;
  className?: string;
  placeholder?: string;
};

export function DateRangePicker({
  from,
  to,
  onChange,
  className,
  placeholder = "Период",
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const value: DateRange | null =
    from && to
      ? {
          start: isoToCalendarDate(from)!,
          end: isoToCalendarDate(to)!,
        }
      : null;

  const label = (() => {
    if (from && to && from === to) return isoToRu(from);
    if (from && to) return `${isoToRu(from)} – ${isoToRu(to)}`;
    if (from) return `с ${isoToRu(from)}`;
    if (to) return `по ${isoToRu(to)}`;
    return placeholder;
  })();

  const isApplied = !!(from || to);

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-9 w-full items-center justify-between gap-2 rounded-[10px] border border-border bg-surface px-3 text-[13px] outline-none transition-colors hover:border-blue-300",
          isApplied ? "text-ink" : "text-muted-2",
        )}
      >
        <span className="flex items-center gap-2">
          <CalendarDays size={14} />
          {label}
        </span>
        {isApplied && (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ from: null, to: null });
            }}
            className="flex h-5 w-5 items-center justify-center rounded-full text-muted-2 hover:bg-red-50 hover:text-red-ink"
          >
            <X size={12} />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 rounded-2xl border border-border bg-surface p-2 shadow-card-lg">
          <I18nProvider locale="ru-RU">
            <RangeCalendar
              aria-label="Выбор периода"
              value={value}
              onChange={(r) => {
                if (r) {
                  onChange({
                    from: calendarDateToIso(r.start as CalendarDate),
                    to: calendarDateToIso(r.end as CalendarDate),
                  });
                }
              }}
            />
          </I18nProvider>
        </div>
      )}
    </div>
  );
}

/* ================== read-only визуализация периода ================== */

/**
 * Read-only календарь с подсвеченным диапазоном — используется в карточке
 * аренды чтобы пользователь видел период «выдан → плановый возврат» +
 * текущую дату на фоне.
 *
 * isReadOnly true — клики не выбирают, только отображение.
 */
export function PeriodCalendarReadOnly({
  from,
  to,
  className,
}: {
  from: string;
  to: string;
  className?: string;
}) {
  const start = isoToCalendarDate(from);
  const end = isoToCalendarDate(to);
  if (!start || !end) return null;
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface p-2",
        className,
      )}
    >
      <I18nProvider locale="ru-RU">
        <RangeCalendar
          aria-label={`Период аренды ${from} – ${to}`}
          value={{ start, end }}
          isReadOnly
        />
      </I18nProvider>
    </div>
  );
}

/**
 * Календарь периода аренды с двумя цветными зонами:
 * — синяя лента от выдачи до планового возврата (это «нормальный»
 *   срок аренды, фирменный цвет)
 * — красная лента от planned + 1 до сегодня (хвост просрочки —
 *   подсвечивается только когда `today > plannedEnd`)
 *
 * Реактивна к данным: если планируемый возврат сдвинется (продление),
 * долг закроется или просрочка снимется — компонент перерисуется со
 * свежим plannedEndIso/overdue, потому что значения приходят сверху из
 * API-данных аренды.
 *
 * Read-only: клики не выбирают, юзер только смотрит.
 */
export function RentalPeriodCalendar({
  startIso,
  plannedEndIso,
  overdueUntilIso,
  className,
}: {
  startIso: string;
  plannedEndIso: string;
  /** Если задан — есть просрочка, подсвечиваем красным до этой даты
   *  включительно. Обычно = сегодняшний день. */
  overdueUntilIso?: string | null;
  className?: string;
}) {
  const start = isoToCalendarDate(startIso);
  const planned = isoToCalendarDate(plannedEndIso);
  const overdueUntil = isoToCalendarDate(overdueUntilIso ?? null);
  if (!start || !planned) return null;

  const tz = getLocalTimeZone();
  const now = today(tz);

  // На каком месяце открывать. Логика:
  //   - если есть просрочка — открываем на «сегодня» (там красный хвост)
  //   - иначе — на «сегодня» если оно внутри периода или в недалёком
  //     будущем; иначе — на месяце начала аренды
  const focusMonth = overdueUntil ?? planned;
  const calendarFocus =
    now.compare(focusMonth) > 0 ? now : focusMonth;

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface p-2",
        className,
      )}
    >
      <I18nProvider locale="ru-RU">
        <CalendarRacBase
          aria-label={`Период аренды ${startIso} – ${plannedEndIso}`}
          isReadOnly
          defaultFocusedValue={calendarFocus}
        >
          <CalendarHeaderInner />
          <CalendarGridRac>
            <CalendarGridHeaderRac>
              {(day) => (
                <CalendarHeaderCellRac className="size-9 rounded-lg p-0 text-[10.5px] font-semibold uppercase tracking-wide text-muted-2">
                  {day}
                </CalendarHeaderCellRac>
              )}
            </CalendarGridHeaderRac>
            <CalendarGridBodyRac className="[&_td]:px-0">
              {(date) => {
                // Зона определяется по компарациям дат:
                //   - в периоде аренды (start ≤ date ≤ planned) → синий
                //   - в хвосте просрочки (planned < date ≤ overdueUntil) → красный
                //   - граничные клетки (start, planned, overdueUntil) — насыщенные
                const inBlueRange =
                  date.compare(start) >= 0 &&
                  date.compare(planned) <= 0;
                const inRedRange =
                  !!overdueUntil &&
                  date.compare(planned) > 0 &&
                  date.compare(overdueUntil) <= 0;
                const isBlueStart = date.compare(start) === 0;
                const isBlueEnd = date.compare(planned) === 0;
                const isRedEnd =
                  !!overdueUntil && date.compare(overdueUntil) === 0;
                const isToday = date.compare(now) === 0;
                return (
                  <CalendarCellRac
                    date={date}
                    className={cn(
                      "relative flex size-9 items-center justify-center whitespace-nowrap p-0 text-[12.5px] font-medium text-ink",
                      // Синий период — мягкий blue-200 с тёмным текстом,
                      // концы — насыщенный ink с белым текстом, как у
                      // RangeCalendar. Скругления только по концам.
                      inBlueRange &&
                        !isBlueStart &&
                        !isBlueEnd &&
                        "bg-blue-200 text-blue-900",
                      isBlueStart &&
                        "rounded-s-lg bg-ink text-white",
                      isBlueEnd &&
                        !isRedEnd &&
                        (overdueUntil
                          ? "bg-ink text-white"
                          : "rounded-e-lg bg-ink text-white"),
                      // Красный хвост — soft red 200 для тела, насыщенный
                      // red-600 для конца (= сегодня).
                      inRedRange &&
                        !isRedEnd &&
                        "bg-red-200 text-red-900",
                      isRedEnd &&
                        "rounded-e-lg bg-red-600 text-white",
                      // Маркер «сегодня» — точка снизу (если сегодня
                      // не на конце красного хвоста, иначе там и так
                      // насыщенный фон).
                      isToday &&
                        !isRedEnd &&
                        cn(
                          "after:pointer-events-none after:absolute after:bottom-1 after:start-1/2 after:z-10 after:size-[3px] after:-translate-x-1/2 after:rounded-full",
                          isBlueStart || isBlueEnd
                            ? "after:bg-white"
                            : "after:bg-ink",
                        ),
                    )}
                  />
                );
              }}
            </CalendarGridBodyRac>
          </CalendarGridRac>
        </CalendarRacBase>
      </I18nProvider>
    </div>
  );
}
