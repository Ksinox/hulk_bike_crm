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

/**
 * v0.6.40: маппинг локального однобуквенного/короткого названия дня
 * недели на двухбуквенное русское «Пн Вт Ср Чт Пт Сб Вс».
 * react-aria для русской локали даёт «пн/вт/ср/чт/пт/сб/вс» (lowercase,
 * двухбуквенно) либо «п/в/с/ч/п/с/в» (однобуквенно) в зависимости от
 * системы. Делаем устойчивый маппинг по первому символу + второму
 * (для пар п-п и с-с).
 */
function ruWeekday(input: string): string {
  const s = String(input || "").trim().toLowerCase();
  if (!s) return input;
  // Если уже 2-буквенное в нужном виде — нормализуем регистр.
  const map: Record<string, string> = {
    пн: "Пн",
    вт: "Вт",
    ср: "Ср",
    чт: "Чт",
    пт: "Пт",
    сб: "Сб",
    вс: "Вс",
    mon: "Пн",
    tue: "Вт",
    wed: "Ср",
    thu: "Чт",
    fri: "Пт",
    sat: "Сб",
    sun: "Вс",
  };
  const two = s.slice(0, 2);
  if (map[two]) return map[two];
  if (map[s]) return map[s];
  // Однобуквенный fallback (п/в/с/ч): не уникально, оставим как есть.
  return input.charAt(0).toUpperCase() + input.slice(1);
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
  // dailyRate больше не используется внутри (сумму продления тут не
  // показываем — см. комментарий у плашки). Проп оставлен в типе для
  // обратной совместимости с CalendarPanel.
  onCommitExtend,
  onPreviewExtend,
  initialDays,
  resetSignal,
  disabled,
  cellSize = 11,
  hideLegend,
  parkingMode = false,
  parkingRanges,
  parkingOccupiedRanges,
  onParkingPick,
  parkingSelectableFromIso,
  parkingSelectableToIso,
  editPeriodMode = false,
  editEndIso,
  onEditPeriodPick,
  editMinReturnIso,
}: {
  startIso: string;
  plannedEndIso: string;
  isOverdue: boolean;
  /** @deprecated не используется — сумму продления показывает «Принять платёж». */
  dailyRate?: number;
  /** v0.6.38: если true — встроенная легенда внизу скрывается; родитель
   *  показывает её сам (например, над календарём). */
  hideLegend?: boolean;
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
  /**
   * v0.8.0 — режим паркинга. В нём клик по дню НЕ продлевает, а вызывает
   * onParkingPick(iso); продление приостановлено. Фиолетовые зоны
   * parkingRanges рисуются всегда (и вне режима — показ зафиксированных
   * сессий). parkingSelectableFrom/To ограничивают окно выбора конца
   * (≤7 суток) — дни вне окна гасятся и не кликабельны.
   */
  parkingMode?: boolean;
  parkingRanges?: { startIso: string; endIso: string }[];
  /**
   * F3 (v0.8.34) — периоды УЖЕ существующих сессий паркинга. Их дни в режиме
   * выбора нельзя выбрать повторно (день не может попасть в паркинг дважды) —
   * они гасятся и становятся некликабельными. В отличие от parkingRanges,
   * сюда НЕ входит черновик текущего выбора (draftStart).
   */
  parkingOccupiedRanges?: { startIso: string; endIso: string }[];
  onParkingPick?: (iso: string) => void;
  parkingSelectableFromIso?: string | null;
  parkingSelectableToIso?: string | null;
  /**
   * v0.6.50 — режим «Изменить период». Коррекция даты возврата кликом ПО
   * ТОМУ ЖЕ календарю (не отдельным input). Включён → текущий период
   * приглушается (editDim); клик по дню ≥ editMinReturnIso выбирает новую
   * дату возврата (раньше baseEnd = сократить, позже = продлить).
   * editPeriodMode и parkingMode взаимоисключающие (гарантирует родитель).
   */
  editPeriodMode?: boolean;
  /** Выбранная НОВАЯ дата возврата (ISO). null пока оператор не кликнул. */
  editEndIso?: string | null;
  onEditPeriodPick?: (iso: string) => void;
  /** Самая ранняя допустимая дата возврата (дней ≥ MIN). Клик раньше — игнор. */
  editMinReturnIso?: string | null;
}) {
  const startKey = isoToKey(startIso);
  const plannedEndKey = isoToKey(plannedEndIso);
  const todayKey = useMemo<DateKey>(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
  }, []);

  // Точка отсчёта продления (v0.6.44 — фикс рассинхронизации с
  // PaymentAcceptDialog):
  //   • Если today > plannedEnd (фактическая просрочка по дате) → today;
  //   • Иначе — plannedEnd.
  // Раньше зависело от пропса `isOverdue`, но он мог приходить false
  // когда rental.status в БД ещё «active», хотя по дате уже просрочка.
  // PaymentAcceptDialog использует `extBase = max(today, anchor)` — тут
  // делаем то же, чтобы плашка «Хватит до» и зелёная зона/плашка
  // календаря считались от одной точки.
  const baseEndKey =
    plannedEndKey && diffDays(plannedEndKey, todayKey) > 0
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
  // v0.6.51: hover-превью в режиме «Изменить период» — день под курсором.
  // Пока новую дату не кликнули, заливаем диапазон start..hover (живой превью,
  // как при продлении). Сбрасывается при уходе курсора и смене режима.
  const [editHoverK, setEditHoverK] = useState<DateKey | null>(null);
  useEffect(() => {
    setEditHoverK(null);
  }, [editPeriodMode]);

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

  /* ---- паркинг: интервалы зон + окно выбора ---- */
  const parkingIntervals = useMemo(() => {
    return (parkingRanges ?? [])
      .map((r) => {
        const s = isoToKey(r.startIso);
        const e = isoToKey(r.endIso);
        return s && e ? { s: keyToTime(s), e: keyToTime(e) } : null;
      })
      .filter((x): x is { s: number; e: number } => x != null);
  }, [parkingRanges]);
  const isParkingDay = (t: number): boolean =>
    parkingIntervals.some((iv) => t >= iv.s && t <= iv.e);
  // F3: интервалы УЖЕ существующих сессий — их дни нельзя выбрать повторно.
  const occupiedIntervals = useMemo(() => {
    return (parkingOccupiedRanges ?? [])
      .map((r) => {
        const s = isoToKey(r.startIso);
        const e = isoToKey(r.endIso);
        return s && e ? { s: keyToTime(s), e: keyToTime(e) } : null;
      })
      .filter((x): x is { s: number; e: number } => x != null);
  }, [parkingOccupiedRanges]);
  const isOccupiedParkingDay = (t: number): boolean =>
    occupiedIntervals.some((iv) => t >= iv.s && t <= iv.e);
  const selFromT = parkingSelectableFromIso
    ? (isoToKey(parkingSelectableFromIso) &&
        keyToTime(isoToKey(parkingSelectableFromIso)!))
    : null;
  const selToT = parkingSelectableToIso
    ? (isoToKey(parkingSelectableToIso) &&
        keyToTime(isoToKey(parkingSelectableToIso)!))
    : null;
  const isOutsideParkingWindow = (t: number): boolean => {
    if (!parkingMode) return false;
    if (selFromT != null && t < selFromT) return true;
    if (selToT != null && t > selToT) return true;
    return false;
  };

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
    // v0.6.50: режим «Изменить период» — клик выбирает НОВУЮ дату возврата
    // (раньше baseEnd = сократить, позже = продлить), но не раньше
    // editMinReturnIso (иначе осталось бы < MIN дней). Продление/паркинг не
    // трогаем — это коррекция самой даты возврата.
    if (editPeriodMode) {
      const t = keyToTime(k);
      const minK = editMinReturnIso ? isoToKey(editMinReturnIso) : null;
      if (minK && t < keyToTime(minK)) return;
      onEditPeriodPick?.(iso);
      return;
    }
    // v0.8.0: режим паркинга — клик выбирает дату, продление не трогаем.
    if (parkingMode) {
      const t = keyToTime(k);
      if (isOutsideParkingWindow(t)) return;
      // F3: день уже входит в существующую сессию паркинга — выбрать нельзя.
      if (isOccupiedParkingDay(t)) return;
      onParkingPick?.(iso);
      return;
    }
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

  // v0.6.51: hover в режиме «Изменить период» — подсветка диапазона до дня
  // под курсором (живой превью, как при продлении). Уважает editMinReturnIso
  // (раньше минимума не подсвечиваем). Делегирование как у onClickGrid.
  const onHoverGrid = (e: React.MouseEvent) => {
    if (disabled || !editPeriodMode) return;
    const tgt = (e.target as HTMLElement).closest(
      "[data-date]",
    ) as HTMLElement | null;
    const iso = tgt?.getAttribute("data-date") ?? null;
    const k = iso ? isoToKey(iso) : null;
    if (!k) {
      setEditHoverK(null);
      return;
    }
    const minK = editMinReturnIso ? isoToKey(editMinReturnIso) : null;
    if (minK && keyToTime(k) < keyToTime(minK)) {
      setEditHoverK(null);
      return;
    }
    setEditHoverK(k);
  };

  /* ---- размеры ----
   * v0.7.9: календарь компактнее — ячейка h-9 (36px), шрифт 13px.
   * Раньше было h-11 (44px)/14px — на широкой панели (760px) сетка
   * выглядела громоздкой. Зональная логика (цвета/края/клик) НЕ
   * меняется — только высота ячейки и размер шрифта.
   * cellSize оставлен для совместимости, но не используется. */
  void cellSize;
  const cellBoxClass = "w-full h-9";
  const fontSizeCls = "text-[13px]";

  /* ---- классы ячейки (наши цвет-зоны) ----
   * Edge-дни всего диапазона — чёрные «handle» (bg-ink) с rounded-l-lg
   * / rounded-r-lg (как data-selection-start/end в оригинальном
   * RangeCalendar). Середина — bg-blue-200/red-200/emerald-200 с
   * rounded-none. Hover НЕ применяется на зональных ячейках. */
  type Zone = "blue" | "red" | "ext" | "parking" | "editDim" | "editNew" | null;
  const zoneOf = (k: DateKey): Zone => {
    const t = keyToTime(k);
    // v0.6.50: режим «Изменить период» переопределяет обычные зоны.
    //   • Ничего не выбрано → текущий период start..plannedEnd показан
    //     приглушённо (editDim) — оператор видит «что было».
    //   • Выбрана новая дата → новый период start..newEnd подсвечен
    //     (editNew); «отрезанный хвост» newEnd..plannedEnd (при сокращении)
    //     остаётся приглушённым (editDim).
    if (editPeriodMode) {
      // v0.6.51: приоритет — день под курсором (hover-превью), иначе
      // зафиксированная дата (после клика), иначе ничего (приглушённый период).
      const pickedK = editEndIso ? isoToKey(editEndIso) : null;
      const newEndK = editHoverK ?? pickedK;
      if (newEndK == null) {
        if (t >= startT && t <= plannedT) return "editDim";
        return null;
      }
      const newEndT = keyToTime(newEndK);
      if (t >= startT && t <= newEndT) return "editNew";
      if (t > newEndT && t <= plannedT) return "editDim";
      return null;
    }
    // Паркинг имеет наивысший приоритет — перекрывает rent/overdue/ext.
    if (isParkingDay(t)) return "parking";
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
    // v0.8.0: в режиме паркинга дни вне окна выбора (≤7 суток / раньше
    // начала) — приглушены и некликабельны.
    const outsideParking = isOutsideParkingWindow(keyToTime(k));
    // F3: дни уже существующих сессий паркинга в режиме выбора —
    // некликабельны (день не может попасть в паркинг дважды).
    const occupiedParking = parkingMode && isOccupiedParkingDay(keyToTime(k));
    // v0.7.12: день планового возврата — тонкая обводка ячейки (доп.
    // маркер). НЕ влияет на зональную логику/цвета/края — просто ring
    // поверх. Помогает оператору сразу увидеть «вот день возврата».
    const isPlannedEndCell = isSame(k, plannedEndKey);

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
      // Паркинг: дни вне окна выбора приглушены/некликабельны.
      outsideParking ? "pointer-events-none opacity-30" : "",
      // F3: дни существующих сессий паркинга — некликабельны (но видны как
      // жёлтая зона). Курсор-запрет вместо обычного.
      occupiedParking ? "pointer-events-none cursor-not-allowed" : "",
    ];

    // Hover — только для ячеек вне зоны.
    if (!zone) {
      parts.push("data-[hovered]:bg-blue-50/60");
    }

    if (zone === "editDim") {
      // v0.6.50: текущие/«отрезанные» дни — плоская блеклая заливка БЕЗ
      // чёрных краёв-«ручек». Скругление по краям своей группы (editDim
      // может соседствовать с editNew слева). Грань = сосед той же зоны нет.
      const prevK = fromJsDate(new Date(k.y, k.m, k.d - 1));
      const nextK = fromJsDate(new Date(k.y, k.m, k.d + 1));
      const isLeftEdge = zoneOf(prevK) !== "editDim";
      const isRightEdge = zoneOf(nextK) !== "editDim";
      const roundCls =
        isLeftEdge && isRightEdge
          ? "rounded-lg"
          : isLeftEdge
            ? "rounded-l-lg"
            : isRightEdge
              ? "rounded-r-lg"
              : "rounded-none";
      parts.push("bg-blue-100 text-blue-400", roundCls);
    } else if (zone === "editNew") {
      // v0.6.50: новый выбранный период — края чёрные «ручки» (как обычный
      // диапазон), середина — плотный bg-blue-300 (ярче обычного blue-200).
      // Грань считаем по «сосед не editNew» (editDim после хвоста = грань),
      // чтобы выбранный день возврата всегда получил правую ручку.
      const prevK = fromJsDate(new Date(k.y, k.m, k.d - 1));
      const nextK = fromJsDate(new Date(k.y, k.m, k.d + 1));
      const isLeftEdge = zoneOf(prevK) !== "editNew";
      const isRightEdge = zoneOf(nextK) !== "editNew";
      const isEdge = isLeftEdge || isRightEdge;
      const colorCls = isEdge ? "bg-ink text-white" : "bg-blue-300 text-blue-900";
      const roundCls =
        isLeftEdge && isRightEdge
          ? "rounded-lg"
          : isLeftEdge
            ? "rounded-l-lg"
            : isRightEdge
              ? "rounded-r-lg"
              : "rounded-none";
      parts.push(colorCls, roundCls);
    } else if (zone) {
      const prevK = fromJsDate(new Date(k.y, k.m, k.d - 1));
      const nextK = fromJsDate(new Date(k.y, k.m, k.d + 1));
      const isLeftEdge = zoneOf(prevK) == null;
      const isRightEdge = zoneOf(nextK) == null;
      const isEdge = isLeftEdge || isRightEdge;

      const colorCls =
        zone === "parking"
          ? isEdge
            ? "bg-yellow-400 text-yellow-950"
            : "bg-yellow-200 text-yellow-900"
          : isEdge
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

    // v0.7.13: день планового возврата — круг с обводкой БЕЗ заливки
    // (before-псевдоэлемент поверх ячейки). Синяя обводка обычно /
    // красная при просрочке (today > plannedEnd). Не трогает зональную
    // заливку/края — рисуется поверх. Если ячейка совпадает с today
    // (даёт ring-ink), не дублируем.
    if (isPlannedEndCell && !(isTodayCell && !zone)) {
      const ringColor = isOverdue
        ? "before:border-red-500"
        : "before:border-blue-500";
      parts.push(
        "before:pointer-events-none before:absolute before:left-1/2 before:top-1/2 before:size-7 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:border-2",
        ringColor,
      );
    }

    return cn(...parts);
  };

  // v0.6.27: previewEnd используется только для зон-расчёта и плашки;
  // multi-month убран. Если оператор кликнул в день из другого месяца,
  // он сам пролистает стрелкой к новому месяцу через onFocusChange.

  return (
    <div
      onClick={onClickGrid}
      onMouseOver={onHoverGrid}
      onMouseLeave={() => setEditHoverK(null)}
      // v0.7.13: тонкая рамка вокруг сетки месяца — чтобы календарь
      // визуально выделялся в блоке (раньше цифры «парили в воздухе»).
      className="w-full rounded-xl border border-border bg-surface p-2.5"
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
                className="p-0 pb-2 text-[11px] font-semibold text-muted-2"
              >
                {/* v0.6.40: react-aria для русской локали отдаёт «пн/вт/...»
                    однобуквенно. Маппим на «Пн Вт Ср Чт Пт Сб Вс». */}
                {ruWeekday(day)}
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

      {/* Подсказка-плашка после выбора дня продления.
          v0.8.x: СУММУ тут больше не показываем — она вводила в
          заблуждение (считалась по текущей ставке аренды, а не по
          тарифной ступени за новое число дней) и расходилась с окном
          «Принять платёж», где сумма считается правильно. Источник
          правды по деньгам — блок «Принять платёж». Здесь оставляем
          только подтверждение нового срока. */}
      {previewDays > 0 && !parkingMode && (
        <div className="mt-2 mx-1 rounded-[10px] bg-emerald-50 border border-emerald-200 px-3 py-2 text-[11.5px] text-emerald-700">
          <b>
            Продление +{previewDays} {previewDays === 1 ? "день" : "дн"}
          </b>
          {previewEnd && (
            <span className="ml-1 text-emerald-700/80">
              до {String(previewEnd.d).padStart(2, "0")}.
              {String(previewEnd.m + 1).padStart(2, "0")}.{previewEnd.y}
              {" — сумма в «Принять платёж»"}
            </span>
          )}
        </div>
      )}

      {/* Легенда снизу. v0.6.38: если hideLegend — родитель показывает её
          сам (например, в шапке CalendarPanel). */}
      {!hideLegend && (
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
      )}
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
