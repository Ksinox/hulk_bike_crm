import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2, RefreshCw } from "lucide-react";
import {
  DEFAULT_BOARD,
  PERIOD_LABEL,
  useAnalyticsBoard,
  type BoardPeriod,
} from "./board";
import { METRIC_BY_ID, periodRange, useMetricValues } from "./metrics";
import { AnalyticsTile } from "./AnalyticsTile";
import { PlanSummaryTile } from "./PlanSummaryTile";
import { useFitLayout } from "./useFitLayout";

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
  // Часы в шапке + мягкое обновление цифр.
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
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
  const gridRef = useRef<HTMLDivElement>(null);
  const spans = useMemo(() => tiles.map((t) => ({ w: t.w, h: t.h })), [tiles]);
  // Та же раскладка, что в конструкторе: колонки подбираются под экран,
  // ряды делят высоту поровну — доска любой длины без прокрутки.
  const { cols, rows } = useFitLayout(gridRef, spans, { gap: 14, minCellH: 130 });

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
        ref={gridRef}
        className="grid min-h-0 flex-1 gap-[1.2vmin]"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          gridAutoFlow: "row dense",
        }}
      >
        {tiles.map((tile, i) => {
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
              primary={tiles.findIndex((t) => t.h >= 2 && t.w >= 2) === i}
              wall
            />
          );
        })}
      </div>
    </div>
  );
}
