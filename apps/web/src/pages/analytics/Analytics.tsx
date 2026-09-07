import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Eye,
  LayoutGrid,
  MonitorUp,
  Plus,
  RotateCcw,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useMe } from "@/lib/api/auth";
import { Topbar } from "@/pages/dashboard/Topbar";
import { useIsMobile } from "@/lib/useIsMobile";
import { SensitiveToggle } from "@/components/Sensitive";
import {
  DEFAULT_BOARD,
  PERIOD_LABEL,
  useAnalyticsBoard,
  useSaveAnalyticsBoard,
  type Board,
  type BoardPeriod,
  type BoardTile,
} from "./board";
import {
  METRICS,
  METRIC_BY_ID,
  METRIC_GROUP_LABEL,
  periodRange,
  useMetricValues,
  type MetricGroup,
} from "./metrics";
import { AnalyticsTile } from "./AnalyticsTile";
import { PlanSummaryTile } from "./PlanSummaryTile";
import { Overview } from "./Overview";
import { MobileBoardEditor } from "./MobileBoardEditor";
import { useFlip } from "./useFlip";
import { useFitLayout } from "./useFitLayout";
import { useTileDrag } from "./useTileDrag";

/**
 * Аналитика (07.09, четвёртая правка заказчика — три раздела).
 *
 *  1. «Обзор»           — для человека: четыре направления со всеми
 *                          показателями, планом, вердиктом и советами.
 *  2. «Настройка стены» — конструктор доски для второго монитора:
 *                          перетаскивание, растягивание за угол, планы.
 *  3. «На второй монитор» — отдельное окно, которое показывает доску
 *                          так, как её настроили.
 *
 * Оба экрана в CRM помещаются в монитор без прокрутки: корень занимает
 * ровно высоту окна, блоки делят её между собой, кегли считаются от блока.
 */

const PERIODS: BoardPeriod[] = ["today", "week", "month", "year"];
type Section = "overview" | "setup";

export function Analytics() {
  const isMobile = useIsMobile();
  const { data: me } = useMe();
  const canEdit = me?.role === "director" || me?.role === "creator" || me?.role === "admin";
  const boardQ = useAnalyticsBoard();
  const save = useSaveAnalyticsBoard();

  const [section, setSection] = useState<Section>("overview");
  const [draft, setDraft] = useState<Board | null>(null);
  const board = draft ?? boardQ.data?.board ?? DEFAULT_BOARD;
  const editing = section === "setup";

  const periodOf = useMemo(() => {
    const map = new Map(board.tiles.map((t) => [t.metric, t.period ?? null]));
    return (metricId: string): BoardPeriod => map.get(metricId) ?? board.period;
  }, [board]);
  const values = useMetricValues(periodOf);

  const boardRef = useRef(board);
  boardRef.current = board;

  const patchTile = (index: number, patch: Partial<BoardTile>) =>
    setDraft((prev) => {
      const base = prev ?? boardRef.current;
      return { ...base, tiles: base.tiles.map((t, i) => (i === index ? { ...t, ...patch } : t)) };
    });
  const removeTile = (index: number) =>
    setDraft((prev) => {
      const base = prev ?? boardRef.current;
      return { ...base, tiles: base.tiles.filter((_, i) => i !== index) };
    });
  const addTile = (metric: string) =>
    setDraft((prev) => {
      const base = prev ?? boardRef.current;
      if (base.tiles.some((t) => t.metric === metric)) return base;
      const def = METRIC_BY_ID.get(metric);
      const big = def?.group === "plan" || def?.percentValue;
      return {
        ...base,
        tiles: [
          ...base.tiles,
          { metric, w: big ? 2 : 1, h: big ? 2 : 1, plan: null, period: def?.defaultPeriod ?? null },
        ],
      };
    });

  /* ---- перетаскивание ---- */
  const gridRef = useRef<HTMLDivElement>(null);
  const move = useCallback((from: number, to: number) => {
    setDraft((prev) => {
      const base = prev ?? boardRef.current;
      const tiles = [...base.tiles];
      const [moved] = tiles.splice(from, 1);
      if (!moved) return base;
      tiles.splice(to, 0, moved);
      return { ...base, tiles };
    });
  }, []);
  const { drag, start: startDrag } = useTileDrag(move);
  const spans = useMemo(() => board.tiles.map((t) => ({ w: t.w, h: t.h })), [board.tiles]);
  // Конструктор — стена в миниатюре: раскладку считаем от размера ЭКРАНА,
  // как её посчитает второй монитор, а рисуем в уменьшенном боксе той же
  // пропорции. Что настроил — то и увидишь.
  const [win, setWin] = useState(() => ({
    w: typeof window === "undefined" ? 1920 : window.innerWidth,
    h: typeof window === "undefined" ? 1080 : window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const wallBox = useMemo(() => {
    // На телефоне окно вертикальное, а второй монитор — горизонтальный.
    // Считать миниатюру по форме телефона было бы враньём, поэтому там
    // берём обычный монитор 16:9.
    if (isMobile) return { w: 1600, h: 780 };
    const vmin = Math.min(win.w, win.h) / 100;
    return { w: win.w - 3.2 * vmin, h: win.h - 3.2 * vmin - 11 * vmin };
  }, [win, isMobile]);
  const fit = useFitLayout(gridRef, spans, { gap: 14, minCellH: 130, box: wallBox });
  // На телефоне сетка не «в экран»: две колонки и высота по содержимому.
  const cols = isMobile ? 2 : fit.cols;
  const flipKey = board.tiles.map((t) => `${t.metric}:${t.w}x${t.h}`).join("|");
  useFlip(gridRef, flipKey, editing);

  const onSave = async () => {
    if (!draft) return;
    try {
      await save.mutateAsync(draft);
      setDraft(null);
      toast.success("Доска сохранена", "Экран на втором мониторе обновится сам");
    } catch {
      toast.error("Не удалось сохранить доску");
    }
  };

  const openWall = () => {
    const url = `${window.location.pathname}?screen=analytics-wall`;
    const win = window.open(url, "hulk-analytics-wall");
    win?.focus?.();
    if (!win)
      toast.error("Браузер заблокировал окно", "Разрешите всплывающие окна для CRM.");
  };

  const range = periodRange(board.period);
  const hidden = METRICS.filter((m) => !board.tiles.some((t) => t.metric === m.id));

  return (
    <main
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-3",
        // Экран помещается в окно целиком: корень — ровно высота окна.
        // На телефоне высоту не фиксируем: там страница прокручивается.
        !isMobile && "h-[100dvh] overflow-hidden p-[18px]",
      )}
    >
      {!isMobile && <Topbar />}

      <header
        className={cn(
          "flex shrink-0 items-center gap-3",
          isMobile ? "flex-nowrap overflow-x-auto pb-1" : "flex-wrap",
        )}
      >
        {!isMobile && (
          <h1 className="font-display text-[30px] font-extrabold leading-none text-ink">
            Аналитика
          </h1>
        )}
        <div className="flex shrink-0 gap-1 rounded-full bg-surface p-1 shadow-card-sm">
          <SectionTab active={section === "overview"} onClick={() => setSection("overview")} icon={<Eye size={14} />}>
            Обзор
          </SectionTab>
          {canEdit && (
            <SectionTab active={section === "setup"} onClick={() => setSection("setup")} icon={<Settings2 size={14} />}>
              Настройка стены
            </SectionTab>
          )}
        </div>
        <SensitiveToggle className="shrink-0" />
        <div
          className={cn(
            "flex items-center gap-2",
            isMobile ? "shrink-0" : "ml-auto flex-wrap",
          )}
        >
          <div className="flex shrink-0 gap-1 rounded-full bg-surface p-1 shadow-card-sm">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setDraft((prev) => ({ ...(prev ?? board), period: p }))}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                  board.period === p ? "bg-ink text-white" : "text-muted hover:text-ink",
                )}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
          {!isMobile && (
            <span className="hidden text-[12.5px] text-muted lg:inline">{range.label}</span>
          )}
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => setDraft(null)}
                disabled={!draft}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[12.5px] font-semibold text-muted shadow-card-sm hover:text-ink disabled:opacity-40"
              >
                <RotateCcw size={14} /> Отменить
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={!draft || save.isPending}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-[12.5px] font-bold text-white disabled:opacity-40"
              >
                <Check size={14} /> Сохранить
              </button>
            </>
          ) : null}
          {/* На телефоне второго монитора нет — кнопку не показываем. */}
          {!isMobile && (
            <button
              type="button"
              onClick={openWall}
              title="Открыть отдельным окном — перетащите на второй монитор и включите полный экран"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[12.5px] font-semibold text-ink shadow-card-sm hover:bg-surface-soft"
            >
              <MonitorUp size={14} /> На второй монитор
            </button>
          )}
        </div>
      </header>

      {section === "overview" ? (
        <Overview board={board} values={values} periodOf={periodOf} compact={isMobile} />
      ) : (
        <div className={cn("flex min-h-0 flex-1 gap-3", isMobile ? "flex-col" : "flex-row")}>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <div className="shrink-0 text-[12.5px] text-muted">
              {isMobile
                ? "Сверху — как доска ляжет на второй монитор. Ниже порядок и размеры плиток: стрелками и кнопками, план — полем."
                : "Это второй монитор в миниатюре: те же колонки и ряды. Перетаскивайте плитки за ручку, тяните за правый нижний угол — ширина и высота в клетках, план — кнопкой-мишенью."}
            </div>
            {/* Тёмный бокс пропорций экрана — стена как она есть, только меньше */}
            <div
              className={cn(
                "flex min-h-0 items-start justify-center",
                isMobile ? "shrink-0" : "flex-1",
              )}
            >
            <div
              ref={gridRef}
              data-grid
              className="grid max-h-full max-w-full gap-[0.7vmin] rounded-[18px] bg-[#070b14] p-[0.8vmin]"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${fit.rows}, minmax(0, 1fr))`,
                aspectRatio: `${wallBox.w} / ${wallBox.h}`,
                width: "100%",
                gridAutoFlow: "row dense",
              }}
            >
              {board.tiles.map((tile, i) => {
                const def = METRIC_BY_ID.get(tile.metric);
                if (!def) return null;
                const shared = {
                  index: i,
                  cols,
                  wall: true,
                  editing: !isMobile,
                  onRemove: () => removeTile(i),
                  onResize: (w: number, h: number) => patchTile(i, { w, h }),
                  onDragStart: (e: React.PointerEvent) => startDrag(i, e),
                  ghost: drag?.index === i,
                };
                if (def.group === "plan") {
                  return (
                    <PlanSummaryTile
                      key={tile.metric}
                      tile={tile}
                      tiles={board.tiles}
                      values={values}
                      periodOf={periodOf}
                      {...shared}
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
                    onPlan={(plan) => patchTile(i, { plan })}
                    {...shared}
                  />
                );
              })}
            </div>
            </div>

            {/* На телефоне доску правим списком — пальцем это надёжнее,
                чем тянуть уголки в миниатюре. */}
            {isMobile && (
              <MobileBoardEditor
                board={board}
                cols={cols}
                onMove={(from, to) => move(from, to)}
                onResize={(i, w, h) => patchTile(i, { w, h })}
                onPlan={(i, plan) => patchTile(i, { plan })}
                onRemove={(i) => removeTile(i)}
              />
            )}
          </div>

          {/* Каталог показателей */}
          <aside
            className={cn(
              "flex w-full shrink-0 flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card-sm lg:w-[280px]",
              !isMobile && "overflow-y-auto",
            )}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
              <LayoutGrid size={12} /> Добавить показатель
            </div>
            {hidden.length === 0 ? (
              <div className="text-[12.5px] text-muted">Все показатели уже на доске.</div>
            ) : (
              (["rent", "sales", "service", "buyout", "plan"] as MetricGroup[]).map((g) => {
                const items = hidden.filter((m) => m.group === g);
                if (items.length === 0) return null;
                return (
                  <div key={g} className="flex flex-col gap-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                      {METRIC_GROUP_LABEL[g]}
                    </div>
                    {items.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => addTile(m.id)}
                        className="flex items-start gap-2 rounded-xl bg-surface-soft p-2.5 text-left transition-colors hover:bg-blue-50"
                      >
                        <Plus size={13} className="mt-0.5 shrink-0 text-blue-600" />
                        <span className="min-w-0">
                          <span className="block text-[13px] font-bold text-ink">
                            {m.title}
                            {m.comingSoon && (
                              <span className="ml-1.5 rounded-full bg-surface px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-muted-2">
                                скоро
                              </span>
                            )}
                          </span>
                          <span className="block text-[11.5px] leading-snug text-muted">{m.about}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })
            )}
          </aside>
        </div>
      )}

      {/* Плитка «в руке» при перетаскивании */}
      {drag && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[9999]"
          style={{
            left: drag.x - drag.offsetX,
            top: drag.y - drag.offsetY,
            width: drag.width,
            height: drag.height,
            transform: "rotate(-1.5deg) scale(1.03)",
            filter: "drop-shadow(0 24px 48px rgba(15,23,42,0.28))",
          }}
          dangerouslySetInnerHTML={{ __html: drag.html }}
        />
      )}
    </main>
  );
}

function SectionTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors",
        active ? "bg-ink text-white" : "text-muted hover:text-ink",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
