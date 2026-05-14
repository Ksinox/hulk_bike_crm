/**
 * DragExtendCalendar v0.6.24 — click-to-extend calendar.
 *
 * База: apps/web/src/components/ui/calendar-rac.tsx (оригинальный shadcn-
 * адаптированный компонент на react-aria-components). Здесь та же
 * структура; внешние пропсы совместимы с предыдущими версиями.
 *
 * Особенности:
 *   • Drag-to-extend УБРАН (v0.6.24). Продление выбирается одним
 *     кликом по нужной дате (как в оригинальном RangeCalendar).
 *     Click на день > baseEnd → новый preview-конец продления +
 *     onCommitExtend(days). Click на baseEnd или ранее → сброс.
 *   • Three zones: blue (start → plannedEnd), red (overdue), green
 *     (preview). Edge-дни ВСЕГО диапазона = чёрные «handle» с
 *     rounded-l-lg / rounded-r-lg (как data-selection-start/end в
 *     оригинале), middle — bg-blue-200/red-200/emerald-200 с
 *     rounded-none. Внутренние стыки зон НЕ края (диапазон визуально
 *     сплошной).
 *   • Hover не действует на зональные ячейки (фон не «отбеливается»).
 *   • Today: точка под цифрой если в зоне, ring-обводка снаружи.
 *   • Multi-month: visibleDuration={{months: 1..4}}. Показываем столько
 *     месяцев, чтобы вся зона (от focusedKey до preview ?? baseEnd)
 *     умещалась. Минимум 1 (период в одном месяце), 2 — если уходит
 *     на следующий, 3+ — дальше.
 *   • initialDays (контролируется родителем, например PaymentAcceptDialog
 *     через RentalCard): синхронизирует preview-конец с input'ом
 *     продления — изменил число дней в диалоге, календарь сразу
 *     обновился.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarCell as CalendarCellRac,
  CalendarGridBody as CalendarGridBodyRac,
  CalendarGridHeader as CalendarGridHeaderRac,
  CalendarGrid as CalendarGridRac,
  CalendarHeaderCell as CalendarHeaderCellRac,
  Calendar as CalendarRac,
} from "react-aria-components";
import { CalendarDate } from "@internationalized/date";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
 * Размер ячейки.  По умолчанию 11 (44px). 13 — для drawer (overlay).
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
  /** Вызывается при click на день > baseEnd с числом дней продления. */
  onCommitExtend?: (days: number) => void;
  /** Вызывается при каждом изменении preview (синхрон с initialDays). */
  onPreviewExtend?: (days: number) => void;
  /**
   * Внешнее число дней продления (например, из PaymentAcceptDialog).
   * Меняется → preview мгновенно подтягивается. Это решает баг
   * v0.6.23 когда изменение input в диалоге не отражалось на
   * календаре.
   */
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

  // v0.6.26: фокус фиксирован на месяце startKey (1-го числа). Не
  // даём react-aria сдвинуть его при клике в другом месяце — иначе
  // visibleMonths считалось бы от смещённого фокуса и второй календарь
  // схлопывался в один (баг v0.6.25 на скриншоте). Стрелки prev/next
  // вместо листания управляют extraMonths (см. ниже).
  const focusForView = useMemo<CalendarDate | undefined>(() => {
    const k = startKey ?? baseEndKey ?? todayKey;
    return k ? new CalendarDate(k.y, k.m + 1, 1) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey?.y, startKey?.m]);

  // Доп. месяцы справа (через кнопку next) — для будущего просмотра/
  // продления за пределами текущей зоны. Reset при изменении start.
  const [extraMonths, setExtraMonths] = useState(0);
  useEffect(() => {
    setExtraMonths(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey?.y, startKey?.m]);

  // Preview-конец продления (state, контролируется click'ом или initialDays).
  const computeInitialPreview = (): DateKey | null => {
    if (!initialDays || initialDays <= 0 || !baseEndKey) return null;
    const dt = new Date(baseEndKey.y, baseEndKey.m, baseEndKey.d + initialDays);
    return fromJsDate(dt);
  };
  const [previewEnd, setPreviewEnd] = useState<DateKey | null>(
    computeInitialPreview,
  );

  // Синхронизация с initialDays извне (input в PaymentAcceptDialog / drawer).
  // Это решает баг v0.6.23 — изменение в input не реактивно обновляло
  // календарь, потому что хук стоял на dragging.current.
  useEffect(() => {
    if (!baseEndKey) return;
    if (initialDays == null || initialDays <= 0) {
      setPreviewEnd(null);
      return;
    }
    const dt = new Date(baseEndKey.y, baseEndKey.m, baseEndKey.d + initialDays);
    setPreviewEnd(fromJsDate(dt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDays]);

  // resetSignal от родителя → стираем preview.
  useEffect(() => {
    if (resetSignal === undefined) return;
    setPreviewEnd(null);
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
  const previewT = previewEnd ? keyToTime(previewEnd) : null;
  const previewDays = previewEnd ? diffDays(baseEndKey, previewEnd) : 0;
  const previewSum =
    dailyRate && previewDays > 0 ? dailyRate * previewDays : null;

  /* ---- click handler (через делегирование на корневой div) ----
   * v0.6.24: drag убран. Click на день > baseEnd → новый preview-конец
   * продления + commit. Click на baseEnd или ранее → сброс. */
  const onClickGrid = (e: React.MouseEvent) => {
    if (disabled) return;
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
      setPreviewEnd(null);
      onPreviewExtend?.(0);
      onCommitExtend?.(0);
      return;
    }
    setPreviewEnd(k);
    onPreviewExtend?.(delta);
    onCommitExtend?.(delta);
  };

  /* ---- размеры ---- */
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
   * Edge-дни всего диапазона — чёрные «handle» (bg-ink) с rounded-l-lg
   * / rounded-r-lg (как data-selection-start/end в оригинальном
   * RangeCalendar). Середина — bg-blue-200/red-200/emerald-200 с
   * rounded-none. Hover НЕ применяется на зональных ячейках. */
  type Zone = "blue" | "red" | "ext" | null;
  const zoneOf = (k: DateKey): Zone => {
    const t = keyToTime(k);
    // ext имеет приоритет (перекрывает день после plannedEnd)
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
      // База — структурно как в calendar-rac.tsx, но с нашим размером.
      "relative flex items-center justify-center whitespace-nowrap border border-transparent p-0 font-medium text-ink outline-offset-2 duration-150 [transition-property:color,background-color,border-radius,box-shadow] focus:outline-none tabular-nums",
      fontSizeCls,
      // focus + outside / disabled
      "data-[focus-visible]:z-10 data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-blue-200",
      "data-[outside-month]:text-muted-2 data-[outside-month]:opacity-40",
      "data-[disabled]:opacity-30 data-[unavailable]:opacity-30",
      // Cursor — кликабельный когда не disabled.
      disabled ? "" : "cursor-pointer",
    ];

    // Hover — только для ячеек вне зоны.
    if (!zone) {
      parts.push("data-[hovered]:bg-blue-50/60");
    }

    if (zone) {
      const prevK = fromJsDate(new Date(k.y, k.m, k.d - 1));
      const nextK = fromJsDate(new Date(k.y, k.m, k.d + 1));
      const isLeftEdge = zoneOf(prevK) == null;
      const isRightEdge = zoneOf(nextK) == null;
      const isEdge = isLeftEdge || isRightEdge;

      const colorCls = isEdge
        ? "bg-ink text-white"
        : zone === "blue"
          ? "bg-blue-200 text-blue-900"
          : zone === "red"
            ? "bg-red-200 text-red-900"
            : "bg-emerald-200 text-emerald-900";

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
      parts.push("rounded-lg");
    }

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

  /* ---- сколько месяцев показывать ----
   * v0.6.26: считаем span от месяца startKey (= левый видимый) до
   * правого края зоны (preview ?? baseEnd). Это даёт «1 месяц если
   * период умещается в один, 2 если уходит на второй, 3+ дальше».
   * Не зависит от того куда react-aria подвинул бы focus.
   * Плюс extraMonths — добавочные месяцы справа через кнопку next.
   * Clamp 1..6. */
  const startMonthIdx = startKey.y * 12 + startKey.m;
  const rangeEndKey = previewEnd ?? baseEndKey;
  const endMonthIdx = rangeEndKey.y * 12 + rangeEndKey.m;
  const naturalSpan = Math.max(1, endMonthIdx - startMonthIdx + 1);
  const visibleMonths = Math.min(6, naturalSpan + extraMonths);

  /* ---- подпись месяца с offset ---- */
  const monthLabel = (offset: number): string => {
    if (!focusForView) return "";
    const cd = focusForView.add({ months: offset });
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
          return (
            <CalendarCellRac
              date={date}
              data-date={iso}
              style={cellBoxStyle}
              className={cellClass(date)}
            >
              {({ formattedDate }) => (
                <span className="pointer-events-none">
                  {formattedDate || String(k.d)}
                </span>
              )}
            </CalendarCellRac>
          );
        }}
      </CalendarGridBodyRac>
    </CalendarGridRac>
  );

  return (
    <div
      onClick={onClickGrid}
      className="w-full rounded-2xl bg-surface p-2"
    >
      <CalendarRac
        aria-label="Календарь аренды"
        className="w-full"
        // v0.6.26: focus фиксирован на месяце start. Не контролируем
        // через onFocusChange — иначе react-aria сдвигал бы его при
        // клике в другом месяце и multi-month схлопывался.
        focusedValue={focusForView}
        visibleDuration={{ months: visibleMonths }}
        // Полностью отключаем стандартный select (мы сами обрабатываем
        // клик через делегирование на корневой div).
        isReadOnly
      >
        {/* Шапка: prev (убавить кол-во месяцев) | spacer | next
            (добавить ещё месяц справа). Заголовки месяцев — над
            каждой сеткой ниже, чтобы flex-wrap корректно работал. */}
        <header className="flex w-full items-center justify-between gap-1 pb-1 px-1">
          <button
            type="button"
            onClick={() => setExtraMonths((n) => Math.max(0, n - 1))}
            disabled={extraMonths <= 0}
            aria-label="Меньше месяцев"
            className="flex size-9 items-center justify-center rounded-lg text-muted-2 transition-colors hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-2 disabled:cursor-not-allowed focus:outline-none"
          >
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() =>
              setExtraMonths((n) =>
                Math.min(6 - naturalSpan, n + 1),
              )
            }
            disabled={visibleMonths >= 6}
            aria-label="Показать ещё месяц"
            className="flex size-9 items-center justify-center rounded-lg text-muted-2 transition-colors hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-2 disabled:cursor-not-allowed focus:outline-none"
          >
            <ChevronRight size={18} strokeWidth={2} />
          </button>
        </header>

        {/* Сетки месяцев с собственными заголовками. flex-wrap, чтобы
            второй (третий…) календарь при недостатке ширины переходил
            на новую строку, а не вытеснялся в overflow. */}
        <div className="flex flex-wrap gap-4 items-start justify-center">
          {Array.from({ length: visibleMonths }, (_, i) => (
            <div key={i} className="flex flex-col items-center">
              <div className="mb-1 text-center text-[15px] font-semibold capitalize text-ink">
                {monthLabel(i)}
              </div>
              {renderMonthGrid(i)}
            </div>
          ))}
        </div>
      </CalendarRac>

      {/* Подсказка-плашка во время / после выбора дня продления */}
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
            кликните на день — продлить
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
