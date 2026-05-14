/**
 * DragExtendCalendar — основной календарь карточки аренды v0.6.1
 * с drag-to-extend.
 *
 * Три зоны (по дизайн-референсу design/claude-design/Hulk Bike CRM/calendar.jsx):
 *   • Синяя       — текущий период аренды (start → endPlanned)
 *   • Красная     — просрочка (endPlanned+1 → today), если просрочена
 *   • Зелёная     — preview продления (формируется во время drag)
 *
 * Взаимодействие:
 *   • На правом краю последнего дня (endPlanned, или today если просрочена)
 *     отрисован drag-handle (синяя «полоска» с иконкой grip).
 *   • Mouse-down на handle → начинается drag. Mouse-move по календарю
 *     ищет ячейку под курсором (через data-date атрибут) и расширяет
 *     preview-зону вправо. Mouse-up завершает drag:
 *       — если новых дней нет (drop назад/на handle) → preview сбрасывается;
 *       — если есть → вызывается onCommitExtend(days), родитель открывает
 *         PaymentAcceptDialog с предзаполненным числом дней.
 *
 * Реализация координат: data-date на каждой ячейке = YYYY-MM-DD строка.
 * В onMouseMove ищем e.target.closest('[data-date]'), парсим дату, делаем
 * diff в днях от точки отсчёта (originalEnd для активной аренды, today
 * для просроченной). Если diff > 0 — preview становится этой ячейкой.
 */
import { useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

const RU_MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];
const RU_DOW = ["П", "В", "С", "Ч", "П", "С", "В"];

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
function todayKey(): DateKey {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
}
function fromDate(dt: Date): DateKey {
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
}

export function DragExtendCalendar({
  startIso,
  plannedEndIso,
  isOverdue,
  /** Опционально: ставка/сутки для подсказки в плашке во время drag. */
  dailyRate,
  /** Вызывается на mouse-up если новых дней > 0. */
  onCommitExtend,
  /**
   * v0.6.10: вызывается на каждое изменение preview во время drag.
   * Используется в floating-режиме (overlay paradigm): bottom-drawer
   * PaymentAcceptDialog подписывается на live-изменения и сразу
   * пересчитывает acceptedStr/footer.
   */
  onPreviewExtend,
  /** v0.6.10: начальное число дней продления — для рендера зелёной зоны
   * при первом монтировании floating-календаря, когда extDays>0 уже
   * выбран через спиннер в drawer'е. */
  initialDays,
  /** Опционально, чтобы заблокировать drag (например, в архивных). */
  disabled,
}: {
  startIso: string;
  plannedEndIso: string;
  isOverdue: boolean;
  dailyRate?: number;
  onCommitExtend?: (days: number) => void;
  onPreviewExtend?: (days: number) => void;
  initialDays?: number;
  disabled?: boolean;
}) {
  const startKey = isoToKey(startIso);
  const plannedEndKey = isoToKey(plannedEndIso);
  const today = todayKey();

  // Точка отсчёта продления:
  //   • для просроченной — после сегодняшнего дня
  //   • иначе — после плана возврата
  const baseEndKey = isOverdue && plannedEndKey && diffDays(plannedEndKey, today) > 0 ? today : plannedEndKey;

  const [viewMonth, setViewMonth] = useState<{ y: number; m: number }>(() => {
    if (baseEndKey) return { y: baseEndKey.y, m: baseEndKey.m };
    return { y: today.y, m: today.m };
  });

  // v0.6.10: если родитель передал initialDays — сразу рисуем preview зелёным
  // (см. floating-режим в PaymentAcceptDialog). Когда пользователь начнёт
  // drag — setDragEnd перетрёт значение, а после mouse-up зафиксируется.
  const computeInitialDragEnd = (): DateKey | null => {
    if (!initialDays || initialDays <= 0 || !baseEndKey) return null;
    const dt = new Date(baseEndKey.y, baseEndKey.m, baseEndKey.d + initialDays);
    return fromDate(dt);
  };
  const [dragEnd, setDragEnd] = useState<DateKey | null>(computeInitialDragEnd);
  const dragging = useRef(false);
  const gridRef = useRef<HTMLDivElement | null>(null);

  // Если initialDays меняется снаружи (пользователь жмёт +/- в drawer'е) —
  // синхронизируем preview-зону.
  useEffect(() => {
    if (dragging.current) return;
    setDragEnd(computeInitialDragEnd());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDays]);

  // mouse-up глобально — даже если отпустить вне сетки
  useEffect(() => {
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.classList.remove("select-none");
      const days = dragEnd && baseEndKey ? diffDays(baseEndKey, dragEnd) : 0;
      if (days > 0) {
        onCommitExtend?.(days);
      }
      setDragEnd(null);
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [dragEnd, baseEndKey, onCommitExtend]);

  if (!startKey || !plannedEndKey || !baseEndKey) {
    return (
      <div className="text-[11px] text-muted-2">Недостаточно данных для календаря.</div>
    );
  }

  const cells: DateKey[] = [];
  const firstOfMonth = new Date(viewMonth.y, viewMonth.m, 1);
  const dowMon = (firstOfMonth.getDay() + 6) % 7; // пн=0
  const gridStart = new Date(viewMonth.y, viewMonth.m, 1 - dowMon);
  for (let i = 0; i < 42; i++) {
    const dt = new Date(gridStart);
    dt.setDate(gridStart.getDate() + i);
    cells.push(fromDate(dt));
  }

  const startDrag = (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    document.body.classList.add("select-none");
  };

  const onMouseMoveGrid = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    const tgt = (e.target as HTMLElement).closest("[data-date]") as HTMLElement | null;
    if (!tgt) return;
    const iso = tgt.dataset.date;
    if (!iso) return;
    const k = isoToKey(iso);
    if (!k) return;
    // не разрешаем тянуть «назад» в сторону baseEnd — это уже учтённые дни
    const delta = diffDays(baseEndKey, k);
    if (delta <= 0) {
      setDragEnd(null);
      onPreviewExtend?.(0);
      return;
    }
    setDragEnd(k);
    onPreviewExtend?.(delta);
  };

  const previewEnd = dragEnd;
  const previewDays = previewEnd ? diffDays(baseEndKey, previewEnd) : 0;
  const previewSum = dailyRate && previewDays > 0 ? dailyRate * previewDays : null;

  // navigation
  const prevMonth = () => {
    const dt = new Date(viewMonth.y, viewMonth.m - 1, 1);
    setViewMonth({ y: dt.getFullYear(), m: dt.getMonth() });
  };
  const nextMonth = () => {
    const dt = new Date(viewMonth.y, viewMonth.m + 1, 1);
    setViewMonth({ y: dt.getFullYear(), m: dt.getMonth() });
  };

  // Сравнения дат через timestamp baseline.
  const startT = keyToTime(startKey);
  const plannedT = keyToTime(plannedEndKey);
  const baseT = keyToTime(baseEndKey);
  const todayT = keyToTime(today);

  return (
    <div className="select-none rounded-2xl bg-surface p-2">
      {/* v0.6.13: шапка месяца в стиле RentalPeriodCalendar (date-picker.tsx) */}
      <div className="flex w-full items-center gap-1 pb-1 px-1">
        <button
          type="button"
          onClick={prevMonth}
          className="flex size-9 items-center justify-center rounded-lg text-muted-2 transition-colors hover:bg-blue-50 hover:text-blue-700"
          aria-label="Предыдущий месяц"
        >
          ‹
        </button>
        <div className="grow text-center text-[13px] font-semibold capitalize text-ink">
          {RU_MONTHS[viewMonth.m].toLowerCase()} {viewMonth.y}
        </div>
        <button
          type="button"
          onClick={nextMonth}
          className="flex size-9 items-center justify-center rounded-lg text-muted-2 transition-colors hover:bg-blue-50 hover:text-blue-700"
          aria-label="Следующий месяц"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7">
        {RU_DOW.map((d, i) => (
          <div
            key={i}
            className="flex size-9 items-center justify-center text-[10.5px] font-semibold uppercase tracking-wide text-muted-2"
          >
            {d}
          </div>
        ))}
      </div>
      <div
        ref={gridRef}
        className="grid grid-cols-7"
        onMouseMove={onMouseMoveGrid}
      >
        {cells.map((d) => {
          const iso = keyToIso(d);
          const t = keyToTime(d);
          const inMonth = d.m === viewMonth.m;
          // Синяя зона (текущий период аренды): start → plannedEnd
          const inBlueRange = t >= startT && t <= plannedT;
          // Красная зона (просрочка): plannedEnd+1 → today (если просрочена)
          const inRedRange =
            isOverdue && t > plannedT && t <= todayT;
          // Жёлтая «не хватает» зона — пока не реализуем, нужна shortage
          // (TODO: пробросить из родителя если потребуется).
          // Зелёная зона (продление preview): после baseEnd → previewEnd
          const inExtension =
            previewEnd != null && t > baseT && t <= keyToTime(previewEnd);
          const isBlueStart = isSame(d, startKey);
          const isBlueEnd = isSame(d, plannedEndKey);
          const isRedEnd =
            isOverdue && plannedEndKey && t === todayT && todayT > plannedT;
          const isExtEnd =
            previewEnd != null && isSame(d, previewEnd);
          const isToday = isSame(d, today);
          const isCurrentEnd = previewEnd
            ? isSame(d, previewEnd)
            : isSame(d, baseEndKey);

          // Базовый цвет текста для дней вне месяца.
          const classes: string[] = [
            "relative flex size-9 items-center justify-center whitespace-nowrap p-0 text-[12.5px] font-medium tabular-nums",
            inMonth ? "text-ink" : "text-muted-2 opacity-40",
          ];

          // Синий период
          if (inBlueRange && !isBlueStart && !isBlueEnd) {
            classes.push("bg-blue-200 text-blue-900");
          }
          if (isBlueStart) {
            classes.push("rounded-s-lg bg-ink text-white");
          }
          if (isBlueEnd && !isRedEnd && !isExtEnd) {
            // Если есть продолжение (overdue/extension) — без round-конца.
            classes.push(
              isOverdue || inExtension
                ? "bg-ink text-white"
                : "rounded-e-lg bg-ink text-white",
            );
          }
          // Красный хвост просрочки
          if (inRedRange && !isRedEnd && !inExtension) {
            classes.push("bg-red-200 text-red-900");
          }
          if (isRedEnd && !inExtension && !isExtEnd) {
            classes.push("rounded-e-lg bg-red-600 text-white");
          }
          // Зелёная зона продления (preview)
          if (inExtension && !isExtEnd) {
            classes.push("bg-emerald-200 text-emerald-900");
          }
          if (isExtEnd) {
            classes.push("rounded-e-lg bg-emerald-600 text-white");
          }
          // Маркер «сегодня» — точка снизу (как в RentalPeriodCalendar).
          if (isToday && !isRedEnd && !isExtEnd && !isBlueStart && !isBlueEnd) {
            classes.push(
              "after:pointer-events-none after:absolute after:bottom-1 after:start-1/2 after:z-10 after:size-[3px] after:-translate-x-1/2 after:rounded-full after:bg-ink",
            );
          }

          const showHandle = isCurrentEnd && !disabled;

          return (
            <div
              key={iso}
              data-date={iso}
              className="relative flex size-9 items-center justify-center"
            >
              <div className={cn(...classes)}>
                {d.d}
                {showHandle && (
                  <button
                    type="button"
                    onMouseDown={startDrag}
                    title="Тяните вправо чтобы продлить"
                    aria-label="Продлить аренду — потяните вправо"
                    className="absolute -right-1.5 top-1/2 z-20 -translate-y-1/2 h-6 w-3 rounded-r-md bg-blue-600 cursor-ew-resize flex items-center justify-center text-white hover:bg-blue-700 active:scale-110 transition-transform shadow-card-sm"
                  >
                    <GripVertical size={9} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Подсказка-плашка во время drag */}
      {previewDays > 0 && (
        <div className="mt-2 mx-1 rounded-[10px] bg-emerald-50 border border-emerald-200 px-3 py-2 text-[11.5px] text-emerald-700 flex items-center justify-between gap-3">
          <div>
            <b>Продление +{previewDays} {previewDays === 1 ? "день" : "дн"}</b>
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
