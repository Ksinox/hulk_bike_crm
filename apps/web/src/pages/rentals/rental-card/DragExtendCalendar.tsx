/**
 * DragExtendCalendar v0.6.18 — переписан на react-aria-components.
 *
 * База: apps/web/src/components/ui/calendar-rac.tsx (оригинальный shadcn-
 * адаптированный компонент). Здесь та же структура:
 *   <CalendarRac>
 *     <CalendarHeader /> — Button slot="previous" + HeadingRac + Button slot="next"
 *     <CalendarGridRac>
 *       <CalendarGridHeaderRac>{...}</CalendarGridHeaderRac>
 *       <CalendarGridBodyRac>{(date) => <CalendarCellRac date={date} className={fn} />}</CalendarGridBodyRac>
 *     </CalendarGridRac>
 *   </CalendarRac>
 *
 * Отличия от calendar-rac.tsx:
 *   • Размер ячейки size-11 (44px) вместо size-9; шрифт text-[15px];
 *   • Selection полностью выключен (defaultValue не задан + visuallyDisabled
 *     для ячеек не нужен — мы не используем стандартный data-selected, а
 *     рисуем СВОИ цвет-зоны через className-функцию ячейки);
 *   • Три зоны: blue (start → plannedEnd), red (overdue), green (preview).
 *     v0.6.22: edge-дни всего диапазона = чёрный квадрат (bg-ink) с
 *     rounded-l-lg / rounded-r-lg (как data-selection-start/end в
 *     оригинальном RangeCalendar). Середина — bg-blue-200/red-200/
 *     emerald-200, rounded-none. Внутренние стыки зон (blue→red,
 *     red→ext) — НЕ края: цвет меняется, чёрных квадратов нет.
 *     Hover не действует на зональные ячейки (фон зоны не «отбеливается»
 *     при наведении).
 *     Today — точка под цифрой если внутри зоны, ring-обводка снаружи.
 *   • Multi-month: visibleDuration={{months: 1..4}}. По умолчанию 1
 *     месяц (когда зона помещается в текущий), 2 — если уходит на
 *     следующий, 3+ — дальше. Растягиваем вправо при drag preview;
 *     авто-скролл фокуса когда курсор близок к правому/левому краю.
 *   • На текущем end-handle (previewEnd или plannedEnd / today-при-overdue)
 *     рендерится drag-handle справа — синяя полоска с GripVertical.
 *     onMouseDown → начинается drag. onMouseMove на grid'е находит
 *     ячейку под курсором через [data-date]-атрибут (передаётся как
 *     обычный data-attr на CalendarCellRac, который пробрасывает его
 *     на td). По iso дате считаем delta и обновляем preview.
 *   • После mouse-up preview ОСТАЁТСЯ (v0.6.17 поведение): сбрасывается
 *     только resetSignal'ом от родителя или новым drag'ом.
 *
 * Внешний интерфейс полностью совместим с предыдущей реализацией —
 * CalendarPanel и RentalCard работают без правок.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  CalendarCell as CalendarCellRac,
  CalendarGridBody as CalendarGridBodyRac,
  CalendarGridHeader as CalendarGridHeaderRac,
  CalendarGrid as CalendarGridRac,
  CalendarHeaderCell as CalendarHeaderCellRac,
  Calendar as CalendarRac,
} from "react-aria-components";
import { CalendarDate } from "@internationalized/date";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- helpers ------------------------------------------------------ */

type DateKey = { y: number; m: number; d: number };

function isoToKey(iso: string): DateKey | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: +m[1], m: +m[2] - 1, d: +m[3] };
}
function keyToIso(k: DateKey): string {
  return `${k.y}-${String(k.m + 1).padStart(2, "0")}-${String(k.d).padStart(2, "0")}`;
}
function keyToTime(k: DateKey): number {
  return new Date(k.y, k.m, k.d).getTime();
}
function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((keyToTime(b) - keyToTime(a)) / 86400000);
}
function isSame(a: DateKey, b: DateKey): boolean {
  return a.y === b.y && a.m === b.m && a.d === b.d;
}
function calendarDateToKey(cd: CalendarDate): DateKey {
  // CalendarDate.month — 1-based
  return { y: cd.year, m: cd.month - 1, d: cd.day };
}
function fromJsDate(dt: Date): DateKey {
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
}

/* ---------- component ---------------------------------------------------- */

/**
 * Размер ячейки. По умолчанию 11 (44px) — основной размер v0.6.18.
 * Можно увеличить до 13 в drawer-открытии (overlay paradigm).
 */
type CellSize = 9 | 11 | 13;

export function DragExtendCalendar({
  startIso,
  plannedEndIso,
  isOverdue,
  dailyRate,
  onCommitExtend,
  onPreviewExtend,
  initialDays,
  resetSignal,
  disabled,
  cellSize = 11,
}: {
  startIso: string;
  plannedEndIso: string;
  isOverdue: boolean;
  dailyRate?: number;
  onCommitExtend?: (days: number) => void;
  onPreviewExtend?: (days: number) => void;
  initialDays?: number;
  resetSignal?: number;
  disabled?: boolean;
  cellSize?: CellSize;
}) {
  const startKey = isoToKey(startIso);
  const plannedEndKey = isoToKey(plannedEndIso);
  const todayKey = useMemo<DateKey>(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
  }, []);

  // Точка отсчёта продления:
  //   • если просрочена и today > plannedEnd → today;
  //   • иначе — plannedEnd.
  const baseEndKey =
    isOverdue && plannedEndKey && diffDays(plannedEndKey, todayKey) > 0
      ? todayKey
      : plannedEndKey;

  // Focus / view month: на месяце startKey (1-го числа). В multi-month
  // виде это даёт start слева, baseEnd справа. react-aria управляет
  // стрелочной навигацией через focusedValue.
  const initialFocus = useMemo<CalendarDate | undefined>(() => {
    const k = startKey ?? baseEndKey ?? todayKey;
    return k ? new CalendarDate(k.y, k.m + 1, 1) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey?.y, startKey?.m]);
  const [focusedDate, setFocusedDate] = useState<CalendarDate | undefined>(
    initialFocus,
  );

  // Preview drag-end.
  const computeInitialDragEnd = (): DateKey | null => {
    if (!initialDays || initialDays <= 0 || !baseEndKey) return null;
    const dt = new Date(baseEndKey.y, baseEndKey.m, baseEndKey.d + initialDays);
    return fromJsDate(dt);
  };
  const [dragEnd, setDragEnd] = useState<DateKey | null>(computeInitialDragEnd);
  const dragging = useRef(false);
  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  // v0.6.22: для авто-скролла во время drag (когда курсор у краёв).
  const lastAutoScrollRef = useRef(0);

  // Синхронизация с initialDays извне (спиннер в drawer).
  useEffect(() => {
    if (dragging.current) return;
    if (!initialDays || initialDays <= 0 || !baseEndKey) {
      setDragEnd(null);
      return;
    }
    const dt = new Date(baseEndKey.y, baseEndKey.m, baseEndKey.d + initialDays);
    setDragEnd(fromJsDate(dt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDays]);

  // mouse-up глобально.
  useEffect(() => {
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.classList.remove("select-none");
      const days = dragEnd && baseEndKey ? diffDays(baseEndKey, dragEnd) : 0;
      if (days > 0) {
        onCommitExtend?.(days);
        // preview остаётся (v0.6.17)
      } else {
        setDragEnd(null);
      }
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [dragEnd, baseEndKey, onCommitExtend]);

  // resetSignal от родителя → стираем preview-зону.
  useEffect(() => {
    if (resetSignal === undefined) return;
    if (dragging.current) return;
    setDragEnd(null);
    onPreviewExtend?.(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  if (!startKey || !plannedEndKey || !baseEndKey) {
    return (
      <div className="text-[11px] text-muted-2">
        Недостаточно данных для календаря.
      </div>
    );
  }

  /* ---- timestamps для расчёта зон ---- */
  const startT = keyToTime(startKey);
  const plannedT = keyToTime(plannedEndKey);
  const baseT = keyToTime(baseEndKey);
  const todayT = keyToTime(todayKey);
  const previewEnd = dragEnd;
  const previewT = previewEnd ? keyToTime(previewEnd) : null;
  const previewDays = previewEnd ? diffDays(baseEndKey, previewEnd) : 0;
  const previewSum =
    dailyRate && previewDays > 0 ? dailyRate * previewDays : null;

  /* ---- drag handlers ---- */
  const startDrag = (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    document.body.classList.add("select-none");
  };
  const onMouseMoveGrid = (e: React.MouseEvent) => {
    if (!dragging.current) return;

    // Авто-скролл когда курсор близко к правому краю — листаем focusedDate
    // на +1 месяц каждые 400ms. Это даёт пользователю возможность тянуть
    // продление на месяцы вперёд, даже если они изначально не видны.
    const wrap = gridWrapRef.current;
    if (wrap) {
      const rect = wrap.getBoundingClientRect();
      const now = Date.now();
      if (e.clientX > rect.right - 60 && now - lastAutoScrollRef.current > 400) {
        lastAutoScrollRef.current = now;
        setFocusedDate((d) => (d ? d.add({ months: 1 }) : initialFocus));
      } else if (
        e.clientX < rect.left + 60 &&
        now - lastAutoScrollRef.current > 400
      ) {
        lastAutoScrollRef.current = now;
        setFocusedDate((d) =>
          d ? d.subtract({ months: 1 }) : initialFocus,
        );
      }
    }

    const tgt = (e.target as HTMLElement).closest(
      "[data-date]",
    ) as HTMLElement | null;
    if (!tgt) return;
    const iso = tgt.getAttribute("data-date");
    if (!iso) return;
    const k = isoToKey(iso);
    if (!k) return;
    const delta = diffDays(baseEndKey, k);
    if (delta <= 0) {
      setDragEnd(null);
      onPreviewExtend?.(0);
      return;
    }
    setDragEnd(k);
    onPreviewExtend?.(delta);
  };

  /* ---- размеры ----
   * cellSize задаёт сторону ячейки в кратных к 4px (tailwind unit).
   * Используем inline-style чтобы поддержать произвольный размер
   * (включая 13 = 52px, которого нет в дефолтном tailwind). */
  const cellPx = cellSize === 13 ? 52 : cellSize === 9 ? 36 : 44;
  const cellBoxStyle: React.CSSProperties = {
    width: cellPx,
    height: cellPx,
  };
  const fontSizeCls =
    cellSize === 13
      ? "text-[16px]"
      : cellSize === 9
        ? "text-[12.5px]"
        : "text-[15px]";

  /* ---- классы ячейки (наши цвет-зоны) ----
   * v0.6.22: edge-дни всего диапазона — чёрные «handle»-квадраты
   * (bg-ink) с rounded-l-lg / rounded-r-lg, середина — bg-blue-200/
   * red-200/emerald-200 с rounded-none (как data-selection-start/end
   * и .range-middle в оригинальном RangeCalendar). Hover НЕ
   * применяется на зональных ячейках — иначе чёрные edge'и
   * «отбеливались» бы при наведении (баг v0.6.21). */
  type Zone = "blue" | "red" | "ext" | null;
  const zoneOf = (k: DateKey): Zone => {
    const t = keyToTime(k);
    // ext имеет приоритет (он перекрывает день после plannedEnd)
    if (previewT != null && t > baseT && t <= previewT) return "ext";
    if (isOverdue && t > plannedT && t <= todayT) return "red";
    if (t >= startT && t <= plannedT) return "blue";
    return null;
  };

  const cellClass = (date: CalendarDate): string => {
    const k = calendarDateToKey(date);
    const zone = zoneOf(k);
    const isTodayCell = isSame(k, todayKey);

    const parts: string[] = [
      // База — структурно как в calendar-rac.tsx, но размер свой.
      "relative flex items-center justify-center whitespace-nowrap border border-transparent p-0 font-medium text-ink outline-offset-2 duration-150 [transition-property:color,background-color,border-radius,box-shadow] focus:outline-none tabular-nums",
      fontSizeCls,
      // focus + outside / disabled
      "data-[focus-visible]:z-10 data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-blue-200",
      "data-[outside-month]:text-muted-2 data-[outside-month]:opacity-40",
      "data-[disabled]:opacity-30 data-[unavailable]:opacity-30",
    ];

    // Hover — ТОЛЬКО для ячеек вне зоны. В зоне фон уже задан и hover
    // не должен его перебивать (как в оригинальном RangeCalendar, где
    // hover не действует на data-selected).
    if (!zone) {
      parts.push("data-[hovered]:bg-blue-50/60");
    }

    if (zone) {
      // Соседи — для определения левого/правого края всего диапазона.
      // Внутренние стыки зон (blue→red, red→ext) НЕ считаются краями.
      const prevK = fromJsDate(new Date(k.y, k.m, k.d - 1));
      const nextK = fromJsDate(new Date(k.y, k.m, k.d + 1));
      const isLeftEdge = zoneOf(prevK) == null;
      const isRightEdge = zoneOf(nextK) == null;
      const isEdge = isLeftEdge || isRightEdge;

      // Цвет: на edge-днях — чёрный «handle» (как data-selection-start/end
      // в оригинальном RangeCalendar). В середине — фон зоны.
      const colorCls = isEdge
        ? "bg-ink text-white"
        : zone === "blue"
          ? "bg-blue-200 text-blue-900"
          : zone === "red"
            ? "bg-red-200 text-red-900"
            : "bg-emerald-200 text-emerald-900";

      // Скругления — только на крайних днях диапазона; одиночный день =
      // полное скругление (как в оригинальном RangeCalendar).
      const roundCls =
        isLeftEdge && isRightEdge
          ? "rounded-lg"
          : isLeftEdge
            ? "rounded-l-lg"
            : isRightEdge
              ? "rounded-r-lg"
              : "rounded-none";

      parts.push(colorCls, roundCls);
    } else {
      // Не в зоне — стандартное скругление как у обычных ячеек.
      parts.push("rounded-lg");
    }

    // TODAY — если внутри зоны: маленькая точка под цифрой (как в
    // оригинале); если снаружи: ring-обводка.
    if (isTodayCell) {
      if (zone) {
        parts.push(
          "after:pointer-events-none after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:size-1 after:rounded-full after:bg-current",
        );
      } else {
        parts.push("ring-2 ring-ink ring-inset");
      }
    }

    return cn(...parts);
  };

  /* ---- решаем где рендерить drag-handle ---- */
  const handleAt: DateKey | null = previewEnd ?? baseEndKey;

  /* ---- сколько месяцев показывать ----
   * v0.6.23: динамически. Минимум 1 (если весь период умещается в
   * текущий месяц), 2 — если зона перетекает на следующий, 3+ — дальше.
   * Считаем по самой правой точке зоны (preview ?? baseEnd) — сколько
   * месяцев от focusedDate до неё. focusedValue определяет левый
   * видимый месяц; стрелки prev/next двигают его на ±1 месяц
   * (pageBehavior="single"). */
  const focusedKey: DateKey = focusedDate
    ? calendarDateToKey(focusedDate)
    : startKey;
  const rangeEndKey = previewEnd ?? baseEndKey;
  const monthsFromFocus = Math.max(
    0,
    rangeEndKey.y * 12 + rangeEndKey.m - (focusedKey.y * 12 + focusedKey.m),
  );
  const visibleMonths = Math.min(4, Math.max(1, monthsFromFocus + 1));

  /* ---- подпись месяца с offset ---- */
  const monthLabel = (offset: number): string => {
    const base = focusedDate ?? initialFocus;
    if (!base) return "";
    const cd = base.add({ months: offset });
    return new Date(cd.year, cd.month - 1, 1).toLocaleDateString("ru-RU", {
      month: "long",
      year: "numeric",
    });
  };

  /* ---- рендер одной сетки месяца ---- */
  const renderMonthGrid = (offset: number) => (
    <CalendarGridRac
      key={offset}
      offset={offset > 0 ? { months: offset } : undefined}
      className="shrink-0"
    >
      <CalendarGridHeaderRac>
        {(day) => (
          <CalendarHeaderCellRac
            style={cellBoxStyle}
            className="rounded-lg p-0 text-[11px] font-semibold uppercase tracking-wide text-muted-2"
          >
            {day}
          </CalendarHeaderCellRac>
        )}
      </CalendarGridHeaderRac>
      <CalendarGridBodyRac className="[&_td]:p-0">
        {(date) => {
          const k = calendarDateToKey(date);
          const iso = keyToIso(k);
          const isHandle = handleAt != null && isSame(k, handleAt);
          return (
            <CalendarCellRac
              date={date}
              data-date={iso}
              style={cellBoxStyle}
              className={cellClass(date)}
            >
              {({ formattedDate }) => (
                <>
                  <span className="pointer-events-none">
                    {formattedDate || String(k.d)}
                  </span>
                  {isHandle && !disabled && (
                    <button
                      type="button"
                      onMouseDown={startDrag}
                      title="Тяните вправо чтобы продлить"
                      aria-label="Продлить аренду — потяните вправо"
                      className="absolute -right-1.5 top-1/2 z-20 -translate-y-1/2 h-7 w-3.5 rounded-r-md bg-blue-600 cursor-ew-resize flex items-center justify-center text-white hover:bg-blue-700 active:scale-110 transition-transform shadow-card-sm"
                    >
                      <GripVertical size={11} strokeWidth={2.5} />
                    </button>
                  )}
                </>
              )}
            </CalendarCellRac>
          );
        }}
      </CalendarGridBodyRac>
    </CalendarGridRac>
  );

  return (
    <div
      ref={gridWrapRef}
      onMouseMove={onMouseMoveGrid}
      className="w-full select-none rounded-2xl bg-surface p-2 overflow-x-auto"
    >
      <CalendarRac
        aria-label="Календарь аренды"
        className="w-full"
        focusedValue={focusedDate}
        onFocusChange={setFocusedDate}
        // visibleDuration: пересоздаём CalendarRac при изменении числа
        // месяцев чтобы react-aria подцепил новое значение (он берёт
        // duration на mount). key — самый надёжный способ.
        visibleDuration={{ months: visibleMonths }}
        // Стрелки листают по 1 месяцу, не по visibleDuration.
        pageBehavior="single"
        // Полностью отключаем выбор (мы рисуем свои зоны).
        isReadOnly
      >
        {/* Шапка: prev | подписи месяцев | next */}
        <header className="flex w-full items-center gap-1 pb-1 px-1">
          <Button
            slot="previous"
            className="flex size-9 items-center justify-center rounded-lg text-muted-2 outline-offset-2 transition-colors hover:bg-blue-50 hover:text-blue-700 focus:outline-none data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-blue-200"
          >
            <ChevronLeft size={18} strokeWidth={2} />
          </Button>
          <div className="flex flex-1 items-center justify-between gap-4 px-2">
            {Array.from({ length: visibleMonths }, (_, i) => (
              <div
                key={i}
                className="flex-1 text-center text-[15px] font-semibold capitalize text-ink"
              >
                {monthLabel(i)}
              </div>
            ))}
          </div>
          <Button
            slot="next"
            className="flex size-9 items-center justify-center rounded-lg text-muted-2 outline-offset-2 transition-colors hover:bg-blue-50 hover:text-blue-700 focus:outline-none data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-blue-200"
          >
            <ChevronRight size={18} strokeWidth={2} />
          </Button>
        </header>

        {/* Сетка(и) — рядом по горизонтали */}
        <div className="flex gap-4 items-start">
          {Array.from({ length: visibleMonths }, (_, i) =>
            renderMonthGrid(i),
          )}
        </div>
      </CalendarRac>

      {/* Подсказка-плашка во время / после drag */}
      {previewDays > 0 && (
        <div className="mt-2 mx-1 rounded-[10px] bg-emerald-50 border border-emerald-200 px-3 py-2 text-[11.5px] text-emerald-700 flex items-center justify-between gap-3">
          <div>
            <b>
              Продление +{previewDays} {previewDays === 1 ? "день" : "дн"}
            </b>
            {previewEnd && (
              <span className="ml-1 text-emerald-700/80">
                до {String(previewEnd.d).padStart(2, "0")}.
                {String(previewEnd.m + 1).padStart(2, "0")}.{previewEnd.y}
              </span>
            )}
          </div>
          {previewSum != null && (
            <div className="font-bold tabular-nums">
              ≈ {previewSum.toLocaleString("ru-RU")} ₽
            </div>
          )}
        </div>
      )}

      {/* Легенда снизу */}
      <div className="mt-2 px-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted">
        <Legend swatch="bg-blue-200" label="текущий период" />
        {isOverdue && <Legend swatch="bg-red-200" label="просрочка" />}
        <Legend swatch="bg-emerald-200" label="продление" />
        {!disabled && (
          <div className="ml-auto inline-flex items-center gap-1 text-blue-700 font-semibold">
            <GripVertical size={10} /> тяните за ручку
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className={cn("inline-block size-2.5 rounded-sm", swatch)} />
      <span>{label}</span>
    </div>
  );
}

