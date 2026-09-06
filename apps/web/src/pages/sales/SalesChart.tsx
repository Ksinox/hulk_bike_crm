import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BarChart3, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUCKET_AXIS, fmt, fmtCompact, type Bucket, type Point } from "./salesUtils";
import { Sensitive } from "@/components/Sensitive";

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

/** Заказчик 06.09 (п.10): выбор вида графика — столбики или линия. */
type ChartMode = "bars" | "line";
const MODE_KEY = "hulk.salesChart.mode";
function readMode(): ChartMode {
  try {
    return localStorage.getItem(MODE_KEY) === "line" ? "line" : "bars";
  } catch {
    return "bars";
  }
}

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
  const [mode, setModeState] = useState<ChartMode>(readMode);
  const setMode = (m: ChartMode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* приватный режим — не страшно */
    }
  };
  const fieldRef = useRef<HTMLDivElement | null>(null);
  /** Центры колонок — по ним проходит линия (колонки не равной ширины). */
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [xs, setXs] = useState<number[]>([]);
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

  // Линия: измеряем центры колонок после раскладки и при ресайзе.
  useLayoutEffect(() => {
    if (mode !== "line") return;
    const field = fieldRef.current;
    if (!field) return;
    const measure = () => {
      const base = field.getBoundingClientRect().left;
      setXs(
        all.map((_, i) => {
          const el = colRefs.current[i];
          if (!el) return 0;
          const r = el.getBoundingClientRect();
          return r.left - base + r.width / 2;
        }),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(field);
    return () => ro.disconnect();
  }, [mode, all]);

  const yOf = (p: Point) => {
    const v = value(p);
    return top > 0 ? height - (v / top) * height : height;
  };
  const linePts = all
    .map((p, i) => ({ p, x: xs[i] ?? 0, y: yOf(p) }))
    .filter((d) => Number.isFinite(d.x));
  const realPts = linePts.filter((d) => !d.p.forecast);
  const forecastPt = linePts.find((d) => d.p.forecast) ?? null;
  const linePath = realPts.map((d, i) => `${i === 0 ? "M" : "L"}${d.x},${d.y}`).join(" ");
  const areaPath =
    realPts.length > 1
      ? `${linePath} L${realPts[realPts.length - 1]!.x},${height} L${realPts[0]!.x},${height} Z`
      : "";

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

          {/* Линия (06.09, п.10): та же сетка и те же колонки-наведения,
              только вместо столбиков — путь по центрам колонок. */}
          {mode === "line" && realPts.length > 0 && (
            <svg
              className="pointer-events-none absolute left-0 top-0 overflow-visible"
              width="100%"
              height={height}
            >
              <defs>
                <linearGradient id="salesLineFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {areaPath && <path d={areaPath} fill="url(#salesLineFill)" />}
              {realPts.length > 1 && (
                <path
                  d={linePath}
                  fill="none"
                  stroke="#059669"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {forecastPt && realPts.length > 0 && (
                <path
                  d={`M${realPts[realPts.length - 1]!.x},${realPts[realPts.length - 1]!.y} L${forecastPt.x},${forecastPt.y}`}
                  fill="none"
                  stroke="#34d399"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  strokeLinecap="round"
                />
              )}
              {linePts.map((d) => (
                <circle
                  key={d.p.key}
                  cx={d.x}
                  cy={d.y}
                  r={hover === d.p.key ? 5 : d.p.forecast ? 3.5 : 3}
                  fill={d.p.forecast ? "#ecfdf5" : "#fff"}
                  stroke={d.p.forecast ? "#34d399" : "#059669"}
                  strokeWidth={2}
                />
              ))}
            </svg>
          )}

          {/* Столбики (в режиме линии — невидимые колонки для наведения) */}
          <div
            // justify-between: при малом числе столбиков они не жмутся
            // влево — последний (текущий момент) стоит у правого края.
            className="absolute inset-x-0 top-0 flex items-end justify-between gap-[3px]"
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
                  ref={(el) => {
                    colRefs.current[i] = el;
                  }}
                  onMouseEnter={() => setHover(p.key)}
                  onMouseLeave={() => setHover(null)}
                  className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
                  style={{ maxWidth: 72 }}
                >
                  <div
                    className={cn(
                      "w-full origin-bottom rounded-t-[5px]",
                      mode === "line" ? "invisible" : "animate-bar-grow",
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
                          {p.profit > 0 && (
                            <>
                              {" · прибыль "}
                              <Sensitive>{fmt(p.profit)} ₽</Sensitive>
                            </>
                          )}
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
        {/* Вид графика (06.09, п.10) — запоминается в браузере. */}
        <div className="inline-flex rounded-full bg-surface-soft p-0.5">
          {(
            [
              ["bars", "Столбики", BarChart3],
              ["line", "Линия", TrendingUp],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              title={label}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[10.5px] font-semibold transition-colors",
                mode === id ? "bg-ink text-white" : "text-muted hover:text-ink",
              )}
            >
              <Icon size={11} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        <span>{BUCKET_AXIS[bucket]}</span>
        {(onZoom || onPan) && (
          <span className="text-muted-2">
            · колесо — масштаб, перетаскивание — сдвиг по времени
          </span>
        )}
        {forecast && (
          <>
            <span className="inline-block h-2.5 w-2.5 rounded-[2px] border-2 border-dashed border-emerald-400 bg-emerald-50" />
            <span>{mode === "line" ? "пунктир" : "последний столбик"} — прогноз по тренду</span>
          </>
        )}
      </div>
    </div>
  );
}
