import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { BUCKET_AXIS, fmt, fmtCompact, type Bucket, type Point } from "./salesUtils";

/**
 * График динамики продаж (31.08, переработан по фидбэку).
 *
 * Что важно в поведении, а не в украшениях:
 *   • столбик имеет предельную ширину — на одной продаже полоса больше не
 *     растягивается во весь блок и не читается как заливка;
 *   • есть горизонтальная сетка с подписями сумм, иначе высота столбика
 *     ничего не сообщает;
 *   • подписи оси прореживаются под ширину, а не наезжают друг на друга;
 *   • столбики вырастают снизу с небольшой задержкой друг за другом —
 *     видно, что данные обновились после смены периода.
 */

/** «Красивый» шаг сетки: 1/2/5 × 10^n — чтобы подписи были круглыми. */
function niceStep(max: number, lines: number): number {
  if (max <= 0) return 1;
  const raw = max / lines;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const mult = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return mult * pow;
}

export function SalesChart({
  points,
  forecast,
  bucket,
  metric = "revenue",
  height = 168,
  onZoom,
  onPan,
}: {
  points: Point[];
  forecast: Point | null;
  bucket: Bucket;
  /** Что рисуем: деньги или штуки. */
  metric?: "revenue" | "units";
  height?: number;
  /** Колесо над графиком: +1 приблизить, −1 отдалить (правка 31.08). */
  onZoom?: (dir: 1 | -1) => void;
  /** Перетаскивание мышью: сдвиг окна на n интервалов. */
  onPan?: (steps: number) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; moved: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Колесо приближает/отдаляет масштаб. passive:false — иначе браузер
  // прокрутит страницу вместо зума.
  useEffect(() => {
    const el = fieldRef.current;
    if (!el || !onZoom) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      onZoom(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onZoom]);

  // Перетаскивание: считаем, на сколько столбиков «уехала» мышь.
  useEffect(() => {
    if (!dragging || !onPan) return;
    const barW = () => {
      const el = fieldRef.current;
      const n = Math.max(1, points.length + (forecast ? 1 : 0));
      return el ? el.getBoundingClientRect().width / n : 40;
    };
    const onMove = (e: MouseEvent) => {
      const st = drag.current;
      if (!st) return;
      const dx = e.clientX - st.x;
      const steps = Math.trunc(dx / barW());
      if (steps !== 0) {
        // Тянем вправо — уходим в прошлое.
        onPan(-steps);
        drag.current = { x: e.clientX, moved: st.moved + Math.abs(steps) };
      }
    };
    const onUp = () => {
      drag.current = null;
      setDragging(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, onPan, points.length, forecast]);
  const all = useMemo(
    () => (forecast ? [...points, forecast] : points),
    [points, forecast],
  );
  const value = (p: Point) => (metric === "units" ? p.units : p.revenue);
  const max = Math.max(1, ...all.map(value));
  const step = niceStep(max, 3);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const grid = [top, top * (2 / 3), top / 3, 0];

  // Подписи прореживаем: при месяце по дням их 31, все не влезут.
  const every = Math.ceil(all.length / 12);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 gap-2">
        {/* Ось значений */}
        <div
          className="flex w-11 shrink-0 flex-col justify-between pb-5 text-right text-[9.5px] font-semibold tabular-nums text-muted-2"
          style={{ height: height + 20 }}
        >
          {grid.map((g) => (
            <span key={g}>{metric === "units" ? fmt(g) : fmtCompact(g)}</span>
          ))}
        </div>

        {/* Поле графика */}
        <div
          ref={fieldRef}
          onMouseDown={(e) => {
            if (!onPan) return;
            drag.current = { x: e.clientX, moved: 0 };
            setDragging(true);
          }}
          className={cn(
            "relative min-w-0 flex-1 select-none",
            onPan && (dragging ? "cursor-grabbing" : "cursor-grab"),
          )}
          style={{ height: height + 20 }}
        >
          {/* Сетка */}
          <div className="absolute inset-x-0 top-0" style={{ height }}>
            {grid.map((g, i) => (
              <div
                key={g}
                className={cn(
                  "absolute inset-x-0 border-t",
                  i === grid.length - 1 ? "border-border" : "border-border/50",
                )}
                style={{ top: `${(i / (grid.length - 1)) * 100}%` }}
              />
            ))}
          </div>

          {/* Столбики */}
          <div
            className="absolute inset-x-0 top-0 flex items-end justify-start gap-[3px]"
            style={{ height }}
          >
            {all.map((p, i) => {
              const v = value(p);
              const h = top > 0 ? Math.max((v / top) * height, v > 0 ? 4 : 2) : 2;
              const active = hover === p.key;
              const showLabel = p.forecast || all.length <= 12 || i % every === 0;
              return (
                <div
                  key={p.key}
                  onMouseEnter={() => setHover(p.key)}
                  onMouseLeave={() => setHover(null)}
                  className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
                  style={{ maxWidth: 56 }}
                >
                  <div
                    className={cn(
                      "w-full origin-bottom rounded-t-[5px] animate-bar-grow",
                      p.forecast
                        ? "border-2 border-dashed border-emerald-400 bg-emerald-50"
                        : v > 0
                          ? active
                            ? "bg-emerald-600"
                            : "bg-gradient-to-t from-emerald-500 to-emerald-400"
                          : "bg-surface-soft",
                    )}
                    style={{
                      height: `${h}px`,
                      animationDelay: `${Math.min(i * 22, 400)}ms`,
                    }}
                  />
                  {showLabel && (
                    <span className="absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap pt-1 text-[9px] font-medium text-muted-2">
                      {p.label}
                    </span>
                  )}
                  {active && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-[9px] bg-ink px-2.5 py-1.5 text-[11px] text-white shadow-card-lg">
                      <div className="text-white/70">
                        {p.forecast ? "прогноз на следующий интервал" : p.label}
                      </div>
                      <div className="font-bold tabular-nums">
                        {p.forecast || metric === "revenue"
                          ? `${fmt(p.revenue)} ₽`
                          : `${p.units} ед.`}
                      </div>
                      {!p.forecast && (
                        <div className="text-[10px] text-white/70">
                          {p.units} ед.
                          {p.profit > 0 && ` · прибыль ${fmt(p.profit)} ₽`}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-11 text-[10.5px] text-muted-2">
        <span>{BUCKET_AXIS[bucket]}</span>
        {(onZoom || onPan) && (
          <span className="text-muted-2">
            · колесо — масштаб, перетаскивание — сдвиг по времени
          </span>
        )}
        {forecast && (
          <>
            <span className="inline-block h-2.5 w-2.5 rounded-[2px] border-2 border-dashed border-emerald-400 bg-emerald-50" />
            <span>последний столбик — прогноз по тренду</span>
          </>
        )}
      </div>
    </div>
  );
}
