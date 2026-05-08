import { useEffect, useRef, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import {
  CalendarDate,
  getLocalTimeZone,
  parseDate,
  today,
} from "@internationalized/date";
import type { DateRange } from "react-aria-components";
import { I18nProvider } from "react-aria-components";
import { RangeCalendar } from "@/components/ui/calendar-rac";
import { cn } from "@/lib/utils";

/**
 * Фильтр по диапазону дат для списка клиентов. Кликаешь — открывается
 * поповер с пресетами «Сегодня / Вчера / За неделю / За месяц / Все
 * время» + Range-календарь для произвольного диапазона.
 *
 * Значения наружу — ISO `YYYY-MM-DD`. Обнуление любого из концов = «без
 * фильтра по этой границе». Если оба null — фильтр не применяется.
 *
 * Локаль — ru-RU через I18nProvider: дни недели «пн/вт/…», месяцы «июль».
 */

type Props = {
  from: string | null;
  to: string | null;
  onChange: (next: { from: string | null; to: string | null }) => void;
};

const PRESETS = [
  { id: "today", label: "Сегодня" },
  { id: "yesterday", label: "Вчера" },
  { id: "week", label: "За неделю" },
  { id: "month", label: "За месяц" },
  { id: "all", label: "Все время" },
] as const;

type PresetId = (typeof PRESETS)[number]["id"];

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

function rangeFromPreset(
  id: PresetId,
): { from: string | null; to: string | null } {
  if (id === "all") return { from: null, to: null };
  const tz = getLocalTimeZone();
  const t = today(tz);
  if (id === "today") {
    const iso = calendarDateToIso(t);
    return { from: iso, to: iso };
  }
  if (id === "yesterday") {
    const y = t.subtract({ days: 1 });
    const iso = calendarDateToIso(y);
    return { from: iso, to: iso };
  }
  if (id === "week") {
    return {
      from: calendarDateToIso(t.subtract({ days: 6 })),
      to: calendarDateToIso(t),
    };
  }
  // month
  return {
    from: calendarDateToIso(t.subtract({ days: 29 })),
    to: calendarDateToIso(t),
  };
}

function fmtRu(iso: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y!.slice(2)}`;
}

function detectActivePreset(
  from: string | null,
  to: string | null,
): PresetId | null {
  if (!from && !to) return "all";
  for (const p of PRESETS) {
    if (p.id === "all") continue;
    const r = rangeFromPreset(p.id);
    if (r.from === from && r.to === to) return p.id;
  }
  return null;
}

export function DateRangeFilter({ from, to, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Закрываем по клику вне поповера. Стандартный паттерн dropdown'а.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const activePreset = detectActivePreset(from, to);
  const isApplied = !!(from || to);

  const buttonLabel = (() => {
    if (!isApplied) return "Дата добавления";
    if (activePreset && activePreset !== "all") {
      return PRESETS.find((p) => p.id === activePreset)!.label;
    }
    if (from && to && from === to) return fmtRu(from);
    if (from && to) return `${fmtRu(from)} – ${fmtRu(to)}`;
    if (from) return `с ${fmtRu(from)}`;
    return `по ${fmtRu(to)}`;
  })();

  const calendarValue: DateRange | null =
    from && to
      ? {
          start: isoToCalendarDate(from)!,
          end: isoToCalendarDate(to)!,
        }
      : null;

  const handleCalendarChange = (next: DateRange | null) => {
    if (!next) {
      onChange({ from: null, to: null });
      return;
    }
    onChange({
      from: calendarDateToIso(next.start as CalendarDate),
      to: calendarDateToIso(next.end as CalendarDate),
    });
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
          isApplied
            ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
            : "bg-surface-soft text-muted hover:text-ink",
        )}
        title={
          isApplied
            ? "Изменить диапазон дат добавления клиентов"
            : "Фильтр по дате добавления клиента"
        }
      >
        <CalendarDays size={13} />
        {buttonLabel}
        {isApplied && (
          <span
            role="button"
            aria-label="Сбросить фильтр по дате"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ from: null, to: null });
            }}
            className="-mr-1 ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-blue-700/70 hover:bg-blue-100 hover:text-blue-900"
          >
            <X size={11} />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 flex w-[320px] flex-col gap-2 rounded-2xl border border-border bg-surface p-3 shadow-card-lg">
          {/* Пресеты — основные сценарии «новые клиенты» одним кликом. */}
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => {
              const active = activePreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(rangeFromPreset(p.id));
                  }}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                    active
                      ? "bg-ink text-white"
                      : "bg-surface-soft text-muted hover:bg-blue-50 hover:text-blue-700",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Range-календарь для произвольного диапазона. I18nProvider
              задаёт локаль ru-RU — дни и месяцы выводятся по-русски. */}
          <div className="rounded-xl border border-border bg-surface-soft p-2">
            <I18nProvider locale="ru-RU">
              <RangeCalendar
                aria-label="Диапазон дат добавления клиента"
                value={calendarValue}
                onChange={handleCalendarChange}
              />
            </I18nProvider>
          </div>

          {/* Подсказка + кнопка закрыть */}
          <div className="flex items-center justify-between border-t border-border pt-2">
            <div className="text-[10.5px] text-muted-2">
              Выбери диапазон или используй пресеты
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full bg-surface-soft px-3 py-1 text-[11px] font-semibold text-muted hover:bg-border hover:text-ink"
            >
              Готово
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
