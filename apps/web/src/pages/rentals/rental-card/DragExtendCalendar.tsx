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

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-2 px-1">
        <button
          type="button"
          onClick={prevMonth}
          className="h-7 w-7 rounded-full hover:bg-surface-soft flex items-center justify-center text-muted"
          aria-label="Предыдущий месяц"
        >
          ‹
        </button>
        <div className="font-display text-[13px] font-extrabold text-ink tracking-wide">
          {RU_MONTHS[viewMonth.m]} {viewMonth.y}
        </div>
        <button
          type="button"
          onClick={nextMonth}
          className="h-7 w-7 rounded-full hover:bg-surface-soft flex items-center justify-center text-muted"
          aria-label="Следующий месяц"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {RU_DOW.map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px] font-bold text-muted-2 uppercase"
          >
            {d}
          </div>
        ))}
      </div>
      <div
        ref={gridRef}
        className="grid grid-cols-7 gap-y-0.5"
        onMouseMove={onMouseMoveGrid}
      >
        {cells.map((d) => {
          const iso = keyToIso(d);
          const inMonth = d.m === viewMonth.m;
          const inSelected =
            keyToTime(d) >= keyToTime(startKey) &&
            keyToTime(d) <= keyToTime(plannedEndKey);
          const inOverdue =
            isOverdue &&
            keyToTime(d) > keyToTime(plannedEndKey) &&
            keyToTime(d) <= keyToTime(today);
          const inExtension =
            previewEnd != null &&
            keyToTime(d) > keyToTime(baseEndKey) &&
            keyToTime(d) <= keyToTime(previewEnd);
          const isStart = isSame(d, startKey);
          const isEnd = previewEnd ? isSame(d, previewEnd) : isSame(d, baseEndKey);
          const isPlannedEnd = isSame(d, plannedEndKey);
          const isToday = isSame(d, today);

          let bg = "";
          let text = inMonth ? "text-ink-2" : "text-muted-2 opacity-50";
          let extra = "";
          if (inSelected && !isStart && !isPlannedEnd) {
            bg = "bg-blue-50";
            text = "text-blue-700";
          }
          if (inOverdue) {
            bg = "bg-red-soft";
            text = "text-red-ink font-bold";
          }
          if (inExtension) {
            bg = "bg-green-soft";
            text = "text-green-ink font-bold";
          }
          if (isPlannedEnd && !isEnd) {
            extra = "ring-2 ring-ink ring-inset";
            text = "text-ink font-extrabold";
          }
          if (isStart) {
            bg = "bg-ink";
            text = "text-white font-bold";
          }
          if (isEnd) {
            bg = previewEnd ? "bg-green-ink" : "bg-ink";
            text = "text-white font-bold";
          }
          if (isToday && !isEnd && !isStart) {
            extra = "ring-2 ring-blue-600 ring-inset";
          }

          const showHandle = isEnd && !disabled;

          return (
            <div
              key={iso}
              data-date={iso}
              className="relative h-9 flex items-center justify-center"
            >
              <div
                className={cn(
                  "relative h-8 w-8 rounded-full flex items-center justify-center text-[12px] tabular-nums",
                  bg,
                  text,
                  extra,
                )}
              >
                {d.d}
                {showHandle && (
                  <button
                    type="button"
                    onMouseDown={startDrag}
                    title="Тяните вправо чтобы продлить"
                    aria-label="Продлить аренду — потяните вправо"
                    className="absolute -right-2 top-1/2 -translate-y-1/2 h-8 w-3 rounded-r-full bg-blue-600 cursor-ew-resize flex items-center justify-center text-white hover:bg-blue-700 active:scale-110 transition-transform shadow-card-sm"
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
        <div className="mt-3 rounded-[10px] bg-green-soft/70 border border-green-ink/20 px-3 py-2 text-[11.5px] text-green-ink flex items-center justify-between gap-3">
          <div>
            <b>Продление +{previewDays} {previewDays === 1 ? "день" : "дн"}</b>
            {previewEnd && (
              <span className="ml-1 text-green-ink/80">
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
      {/* Легенда */}
      <div className="mt-2 px-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted">
        <Legend swatch="bg-blue-50" label="текущий период" />
        <Legend swatch="bg-red-soft" label="просрочка" />
        <Legend swatch="bg-green-soft" label="продление" />
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
      <span className={cn("inline-block w-2.5 h-2.5 rounded-sm", swatch)} />
      <span>{label}</span>
    </div>
  );
}
