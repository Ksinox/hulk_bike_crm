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
import { I18nProvider } from "react-aria-components";
import { CalendarDays, X } from "lucide-react";
import { Calendar, RangeCalendar } from "@/components/ui/calendar-rac";
import { cn } from "@/lib/utils";

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

/** ru → ISO. Если строка не валидная (частичный ввод) — null. */
function ruToIso(ru: string): string | null {
  const m = ru.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const day = Number(d);
  const month = Number(mo);
  const year = Number(y);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;
  return `${y}-${mo}-${d}`;
}

/** Автоформат при вводе руками: 12042026 → 12.04.2026 */
function formatRuInput(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
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
};

export function DatePicker({
  value,
  onChange,
  placeholder = "ДД.ММ.ГГГГ",
  disabled,
  className,
  clearable = true,
  id,
  minDate,
  maxDate,
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

  const calValue =
    isoToCalendarDate(value) ?? today(getLocalTimeZone());

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
          onChange={(e) => setText(formatRuInput(e.target.value))}
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
 * текущую дату на фоне. Опциональный overdueFrom = дата от которой
 * подкрашиваем красным как «просрочка».
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
