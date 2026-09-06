import { useEffect, useMemo, useState } from "react";
import { Maximize2, Minimize2, RefreshCw } from "lucide-react";
import {
  DEFAULT_BOARD,
  PERIOD_LABEL,
  useAnalyticsBoard,
  type BoardPeriod,
} from "./board";
import { METRIC_BY_ID, periodRange, useMetricValues } from "./metrics";
import { AnalyticsTile, SIZE_SPAN } from "./AnalyticsTile";
import { PlanSummaryTile } from "./PlanSummaryTile";

/**
 * Экран на второй монитор (07.09, вторая правка заказчика).
 *
 * Главное требование: «он должен понимать границы нашего монитора» —
 * экран НИКОГДА не прокручивается. Сколько бы показателей ни было на
 * доске, они раскладываются на столько рядов, сколько нужно, ряды делят
 * высоту поровну, а внутри плиток всё измеряется в единицах контейнера.
 * Мелкий монитор — цифры мельче, большой — крупнее, но помещается всегда.
 */
export function AnalyticsWall() {
  const boardQ = useAnalyticsBoard();
  const board = boardQ.data?.board ?? DEFAULT_BOARD;
  const [now, setNow] = useState(() => new Date());
  const [full, setFull] = useState(false);
  const [vp, setVp] = useState(() => ({
    w: typeof window === "undefined" ? 1920 : window.innerWidth,
    h: typeof window === "undefined" ? 1080 : window.innerHeight,
  }));

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const onResize = () =>
      setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    document.title = board.title ? `${board.title} — Халк Байк` : "Аналитика — Халк Байк";
  }, [board.title]);

  useEffect(() => {
    const prevBg = document.body.style.background;
    const prevOv = document.body.style.overflow;
    document.body.style.background = "#070b14";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.background = prevBg;
      document.body.style.overflow = prevOv;
    };
  }, []);

  const periodOf = useMemo(() => {
    const map = new Map(board.tiles.map((t) => [t.metric, t.period ?? null]));
    return (metricId: string): BoardPeriod => map.get(metricId) ?? board.period;
  }, [board]);
  const values = useMetricValues(periodOf);
  const range = periodRange(board.period, now);

  const tiles = board.tiles.filter((t) => METRIC_BY_ID.has(t.metric));

  /**
   * Раскладку подбираем под конкретный монитор, а не по брейкпоинтам:
   * перебираем число колонок и берём то, при котором клетка получается
   * ближе всего к приятной пропорции (чуть шире квадрата). Из-за этого
   * на широком экране плитки не растягиваются в ленты, на маленьком не
   * дробятся в лапшу, а когда показателей много — рядов становится
   * больше ровно настолько, насколько нужно.
   */
  const { cols, rows } = useMemo(() => {
    const spans = tiles.map((t) => SIZE_SPAN[t.size]);
    const gridH = Math.max(120, vp.h - Math.min(vp.h * 0.16, 130));
    const gap = Math.max(6, Math.min(vp.w, vp.h) * 0.012);
    let best = { cols: 6, rows: 1, score: Number.POSITIVE_INFINITY };
    for (let c = vp.w < 760 ? 2 : 3; c <= (vp.w < 760 ? 3 : 10); c++) {
      const r = packedRows(spans, c);
      const cellW = (vp.w - gap * (c + 1)) / c;
      const cellH = (gridH - gap * (r + 1)) / r;
      if (cellW <= 0 || cellH <= 0) continue;
      // Целевая пропорция клетки — 1.45; штрафуем и слишком мелкие клетки.
      const aspect = Math.abs(cellW / cellH - 1.45);
      const small = cellH < 128 ? (128 - cellH) / 40 : 0;
      const narrow = cellW < 150 ? (150 - cellW) / 60 : 0;
      const score = aspect + small + narrow;
      if (score < best.score) best = { cols: c, rows: r, score };
    }
    return best;
  }, [tiles, vp]);

  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setFull(false);
      } else {
        await document.documentElement.requestFullscreen();
        setFull(true);
      }
    } catch {
      /* браузер может не дать — не страшно */
    }
  };

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#070b14] p-[1.6vmin] text-white">
      <header className="flex shrink-0 flex-wrap items-center gap-[2vmin] px-[1vmin] pb-[1.4vmin]">
        <div className="min-w-0">
          <div className="font-display text-[min(4.4vmin,52px)] font-extrabold leading-none tracking-[-0.02em]">
            {board.title || "Как идут дела"}
          </div>
          <div className="mt-[0.5vmin] text-[min(1.9vmin,22px)] text-white/40">
            {PERIOD_LABEL[board.period]} · {range.label}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-[1.6vmin]">
          <div className="text-right">
            <div className="font-display text-[min(4.4vmin,52px)] font-extrabold leading-none tabular-nums">
              {now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="mt-[0.5vmin] text-[min(1.8vmin,20px)] text-white/35">
              {now.toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                weekday: "short",
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => boardQ.refetch()}
            title="Обновить"
            className="flex h-[max(32px,4vmin)] w-[max(32px,4vmin)] items-center justify-center rounded-full bg-white/[0.07] text-white/60 transition-colors hover:bg-white/15 hover:text-white"
          >
            <RefreshCw className="h-[45%] w-[45%]" />
          </button>
          <button
            type="button"
            onClick={toggleFull}
            title={full ? "Выйти из полного экрана" : "Полный экран"}
            className="flex h-[max(32px,4vmin)] w-[max(32px,4vmin)] items-center justify-center rounded-full bg-white/[0.07] text-white/60 transition-colors hover:bg-white/15 hover:text-white"
          >
            {full ? (
              <Minimize2 className="h-[45%] w-[45%]" />
            ) : (
              <Maximize2 className="h-[45%] w-[45%]" />
            )}
          </button>
        </div>
      </header>

      {/* Сетка занимает ровно остаток экрана: ряды делят высоту поровну,
          поэтому доска любой длины укладывается без прокрутки. */}
      <div
        className="grid min-h-0 flex-1 gap-[1.2vmin]"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {tiles.map((tile) => {
          const def = METRIC_BY_ID.get(tile.metric)!;
          if (def.group === "plan") {
            return (
              <PlanSummaryTile
                key={tile.metric}
                tile={tile}
                tiles={board.tiles}
                values={values}
                periodOf={periodOf}
                cols={cols}
                wall
              />
            );
          }
          return (
            <AnalyticsTile
              key={tile.metric}
              def={def}
              value={values[tile.metric]}
              tile={tile}
              period={periodOf(tile.metric)}
              cols={cols}
              wall
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Сколько рядов займёт доска — повторяем раскладку CSS grid (без dense):
 * идём по плиткам, каждую ставим в первую подходящую позицию не раньше
 * курсора. Знать число рядов нужно заранее, иначе нечего делить поровну.
 */
export function packedRows(
  spans: { col: number; row: number }[],
  cols: number,
): number {
  const occupied = new Set<string>();
  const busy = (r: number, c: number) => occupied.has(`${r}:${c}`);
  let curR = 0;
  let curC = 0;
  let maxRow = 0;

  for (const s of spans) {
    const w = Math.min(s.col, cols);
    const h = s.row;
    let r = curR;
    let c = curC;
    for (;;) {
      if (c + w > cols) {
        r += 1;
        c = 0;
        continue;
      }
      let fits = true;
      for (let dr = 0; dr < h && fits; dr++)
        for (let dc = 0; dc < w; dc++)
          if (busy(r + dr, c + dc)) {
            fits = false;
            break;
          }
      if (fits) break;
      c += 1;
    }
    for (let dr = 0; dr < h; dr++)
      for (let dc = 0; dc < w; dc++) occupied.add(`${r + dr}:${c + dc}`);
    maxRow = Math.max(maxRow, r + h);
    curR = r;
    curC = c + w;
  }
  return Math.max(1, maxRow);
}
