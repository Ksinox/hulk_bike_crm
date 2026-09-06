import { useEffect, useMemo, useState } from "react";
import { Maximize2, Minimize2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_BOARD,
  PERIOD_LABEL,
  useAnalyticsBoard,
  type BoardPeriod,
} from "./board";
import { METRIC_BY_ID, periodRange, useMetricValues } from "./metrics";
import { AnalyticsTile } from "./AnalyticsTile";
import { PlanSummaryTile } from "./PlanSummaryTile";

/**
 * Экран на второй монитор (06.09).
 *
 * Открывается отдельным окном (кнопка «На второй монитор» в «Аналитике»),
 * чтобы его можно было перетащить на висящий монитор и включить полный
 * экран. Тёмный фон и крупная типографика — экран читают от двери, а не
 * с рабочего кресла. Ничего не редактируется: доска собирается в CRM,
 * а сюда прилетает сама (раз в минуту доска, раз в 30 секунд цифры).
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

  // Тёмный фон на всё окно, пока экран открыт.
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = "#080d18";
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  const periodOf = useMemo(() => {
    const map = new Map(board.tiles.map((t) => [t.metric, t.period ?? null]));
    return (metricId: string): BoardPeriod => map.get(metricId) ?? board.period;
  }, [board]);
  const values = useMetricValues(periodOf);
  const range = periodRange(board.period, now);

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
    <div className="min-h-[100dvh] w-full bg-[#080d18] p-5 text-white lg:p-8">
      <header className="mb-5 flex flex-wrap items-center gap-4 lg:mb-7">
        <div className="min-w-0">
          <div className="font-display text-[30px] font-extrabold leading-none lg:text-[40px]">
            {board.title || "Как идут дела"}
          </div>
          <div className="mt-1 text-[15px] text-white/50 lg:text-[18px]">
            {PERIOD_LABEL[board.period]} · {range.label}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="text-right">
            <div className="font-display text-[30px] font-extrabold leading-none tabular-nums lg:text-[40px]">
              {now.toLocaleTimeString("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            <div className="mt-1 text-[14px] text-white/40 lg:text-[16px]">
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
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
          >
            <RefreshCw size={18} />
          </button>
          <button
            type="button"
            onClick={toggleFull}
            title={full ? "Выйти из полного экрана" : "Полный экран"}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
          >
            {full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      </header>

      <div
        className={cn(
          "grid auto-rows-[minmax(136px,1fr)] gap-4",
          "grid-cols-2 xl:grid-cols-4",
        )}
      >
        {board.tiles.map((tile) => {
          const def = METRIC_BY_ID.get(tile.metric);
          if (!def) return null;
          if (def.group === "plan") {
            return (
              <PlanSummaryTile
                key={tile.metric}
                tile={tile}
                tiles={board.tiles}
                values={values}
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
              wall
            />
          );
        })}
      </div>

      <footer className="mt-6 text-[13px] text-white/30">
        Доска собирается в CRM: «Аналитика» → «Настроить». Этот экран обновляется сам.
      </footer>
    </div>
  );
}
