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
 *   • Один месяц всегда (v0.6.27 — multi-month убран). Если зона
 *     перетекает на следующий месяц, оператор листает стрелкой
 *     prev/next.
 *   • initialDays (контролируется родителем, например PaymentAcceptDialog
 *     через RentalCard): синхронизирует preview-конец с input'ом
 *     продления — изменил число дней в диалоге, календарь сразу
 *     обновился.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  CalendarCell as CalendarCellRac,
  CalendarGridBody as CalendarGridBodyRac,
  CalendarGridHeader as CalendarGridHeaderRac,
  CalendarGrid as CalendarGridRac,
  CalendarHeaderCell as CalendarHeaderCellRac,
  Calendar as CalendarRac,
  Heading as HeadingRac,
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

  // v0.6.27: всегда 1 месяц. Фокус по умолчанию = месяц baseEnd
  // (там где реально интересно — конец периода / просрочка). Стрелки
  // prev/next листают по 1 месяцу через стандартный react-aria
  // механизм (onFocusChange).
  const initialFocus = useMemo<CalendarDate | undefined>(() => {
    const k = baseEndKey ?? startKey ?? todayKey;
    return k ? new CalendarDate(k.y, k.m + 1, 1) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseEndKey?.y, baseEndKey?.m]);
  const [focusedDate, setFocusedDate] = useState<CalendarDate | undefined>(
    initialFocus,
  );

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

  /* ---- размеры ----
   * v0.6.30: ячейки FLUID — заполняют 1/7 ширины родителя через
   * table-fixed на CalendarGrid + aspect-square на ячейке. Размер
   * шрифта вырос пропорционально (~17px) — при широком блоке всё
   * выглядит крупно и читаемо, при узком сжимается естественно.
   * cellSize оставлен для совместимости, но не используется. */
  void cellSize;
  const cellBoxClass = "w-full aspect-square";
  const fontSizeCls = "text-[17px]";

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
      // База. border убран чтобы соседние ячейки одной зоны
      // стыковались без 1-px зазора.
      "relative flex items-center justify-center whitespace-nowrap p-0 font-medium text-ink outline-offset-2 duration-150 [transition-property:color,background-color,border-radius,box-shadow] focus:outline-none tabular-nums",
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

  // v0.6.27: previewEnd используется только для зон-расчёта и плашки;
  // multi-month убран. Если оператор кликнул в день из другого месяца,
  // он сам пролистает стрелкой к новому месяцу через onFocusChange.

  return (
    <div
      onClick={onClickGrid}
      className="w-full rounded-2xl bg-surface p-2"
    >
      <CalendarRac
        aria-label="Календарь аренды"
        className="w-full"
        focusedValue={focusedDate}
        onFocusChange={setFocusedDate}
        // Полностью отключаем стандартный select (мы сами обрабатываем
        // клик через делегирование на корневой div).
        isReadOnly
      >
        {/* Шапка: prev | название месяца | next */}
        <header className="flex w-full items-center gap-1 pb-1 px-1">
          <Button
            slot="previous"
            className="flex size-9 items-center justify-center rounded-lg text-muted-2 outline-offset-2 transition-colors hover:bg-blue-50 hover:text-blue-700 focus:outline-none data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-blue-200"
          >
            <ChevronLeft size={18} strokeWidth={2} />
          </Button>
          <HeadingRac className="grow text-center text-[15px] font-semibold capitalize text-ink" />
          <Button
            slot="next"
            className="flex size-9 items-center justify-center rounded-lg text-muted-2 outline-offset-2 transition-colors hover:bg-blue-50 hover:text-blue-700 focus:outline-none data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-blue-200"
          >
            <ChevronRight size={18} strokeWidth={2} />
          </Button>
        </header>

        {/* Сетка месяца — table-fixed + border-collapse чтобы соседние
            цветные ячейки одной зоны стыковались БЕЗ зазоров (как в
            оригинальном RangeCalendar). border-spacing 0 и padding 0
            на td. */}
        <CalendarGridRac className="w-full table-fixed border-collapse">
          <CalendarGridHeaderRac>
            {(day) => (
              <CalendarHeaderCellRac
                className="p-0 pb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-2"
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
                  className={cn(cellBoxClass, cellClass(date))}
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
