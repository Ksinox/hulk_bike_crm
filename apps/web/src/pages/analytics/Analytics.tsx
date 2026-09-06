import { useMemo, useState } from "react";
import {
  Check,
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
  type TileSize,
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

/**
 * Аналитика (06.09) — экран показателей.
 *
 * Задумка простая: один экран отвечает на три вопроса — идём ли по плану,
 * что горит прямо сейчас и сколько денег зашло. Плитки собираются как
 * конструктор: нужное добавили, лишнее убрали, важное сделали крупнее.
 * Этот же экран открывается отдельным окном на второй монитор — там он
 * тёмный и с огромными цифрами, чтобы читалось от двери.
 */

const PERIODS: BoardPeriod[] = ["today", "week", "month", "year"];

export function Analytics() {
  const isMobile = useIsMobile();
  const { data: me } = useMe();
  const canEdit = me?.role === "director" || me?.role === "creator" || me?.role === "admin";
  const boardQ = useAnalyticsBoard();
  const save = useSaveAnalyticsBoard();

  const [draft, setDraft] = useState<Board | null>(null);
  const board = draft ?? boardQ.data?.board ?? DEFAULT_BOARD;
  const editing = draft != null;

  const periodOf = useMemo(() => {
    const map = new Map(board.tiles.map((t) => [t.metric, t.period ?? null]));
    return (metricId: string): BoardPeriod => map.get(metricId) ?? board.period;
  }, [board]);

  const values = useMetricValues(periodOf);

  const patchTile = (index: number, patch: Partial<BoardTile>) => {
    setDraft((prev) => {
      const base = prev ?? board;
      const tiles = base.tiles.map((t, i) => (i === index ? { ...t, ...patch } : t));
      return { ...base, tiles };
    });
  };

  const removeTile = (index: number) => {
    setDraft((prev) => {
      const base = prev ?? board;
      return { ...base, tiles: base.tiles.filter((_, i) => i !== index) };
    });
  };

  const addTile = (metric: string) => {
    setDraft((prev) => {
      const base = prev ?? board;
      if (base.tiles.some((t) => t.metric === metric)) return base;
      const def = METRIC_BY_ID.get(metric);
      return {
        ...base,
        tiles: [
          ...base.tiles,
          {
            metric,
            size: def?.group === "plan" ? "l" : "m",
            plan: null,
            period: def?.defaultPeriod ?? null,
          },
        ],
      };
    });
  };

  /* ---- перетаскивание ---- */
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    setDraft((prev) => {
      const base = prev ?? board;
      const tiles = [...base.tiles];
      const [moved] = tiles.splice(from, 1);
      if (!moved) return base;
      tiles.splice(to > from ? to - 1 : to, 0, moved);
      return { ...base, tiles };
    });
  };

  const onSave = async () => {
    if (!draft) return;
    try {
      await save.mutateAsync(draft);
      setDraft(null);
      toast.success("Доска сохранена", "Её видят все, включая экран на стене");
    } catch {
      toast.error("Не удалось сохранить доску");
    }
  };

  const openWall = () => {
    const url = `${window.location.pathname}?screen=analytics-wall`;
    const win = window.open(url, "hulk-analytics-wall");
    win?.focus?.();
    if (!win) {
      toast.error(
        "Браузер заблокировал окно",
        "Разрешите всплывающие окна для CRM — экран откроется отдельным окном.",
      );
    }
  };

  const range = periodRange(board.period);
  const hidden = METRICS.filter((m) => !board.tiles.some((t) => t.metric === m.id));

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      {!isMobile && <Topbar />}
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[34px] font-extrabold leading-none text-ink">
          Аналитика
        </h1>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-[11.5px] font-bold text-blue-700">
          {board.tiles.length} показателей
        </span>
        <SensitiveToggle />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-full bg-surface p-1 shadow-card-sm">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() =>
                  setDraft((prev) => ({ ...(prev ?? board), period: p }))
                }
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                  board.period === p
                    ? "bg-ink text-white"
                    : "text-muted hover:text-ink",
                )}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={openWall}
            title="Открыть отдельным окном — можно перетащить на второй монитор и включить полный экран"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[12.5px] font-semibold text-ink shadow-card-sm hover:bg-surface-soft"
          >
            <MonitorUp size={14} /> На второй монитор
          </button>
          {canEdit &&
            (editing ? (
              <>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[12.5px] font-semibold text-muted shadow-card-sm hover:text-ink"
                >
                  <RotateCcw size={14} /> Отменить
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={save.isPending}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[12.5px] font-bold text-white disabled:opacity-60"
                >
                  <Check size={14} /> Сохранить доску
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setDraft(board)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[12.5px] font-semibold text-ink shadow-card-sm hover:bg-surface-soft"
              >
                <Settings2 size={14} /> Настроить
              </button>
            ))}
        </div>
      </header>

      <div className="text-[12.5px] text-muted">
        Показатели за период: <b className="text-ink-2">{range.label}</b>. У части
        плиток свой период — он подписан на самой плитке.
        {editing && " Перетаскивайте плитки, меняйте размер и задавайте план."}
      </div>

      <div className="flex min-w-0 flex-col gap-4 xl:flex-row">
        {/* Доска */}
        <div
          className="grid min-w-0 flex-1 auto-rows-[minmax(116px,auto)] grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"
          onDragOver={(e) => {
            if (dragIndex != null) e.preventDefault();
          }}
        >
          {board.tiles.map((tile, i) => {
            const def = METRIC_BY_ID.get(tile.metric);
            if (!def) return null;
            if (def.group === "plan") {
              return (
                <PlanSummaryTile
                  key={tile.metric}
                  tile={tile}
                  tiles={board.tiles}
                  values={values}
                  compact={isMobile}
                  editing={editing}
                  onRemove={() => removeTile(i)}
                  onSize={(size: TileSize) => patchTile(i, { size })}
                  dragging={dragIndex === i}
                  dropBefore={overIndex === i && dragIndex !== i}
                  dragHandlers={{
                    onDragStart: () => setDragIndex(i),
                    onDragOver: (e: React.DragEvent) => {
                      e.preventDefault();
                      setOverIndex(i);
                    },
                    onDrop: (e: React.DragEvent) => {
                      e.preventDefault();
                      if (dragIndex != null) move(dragIndex, i);
                      setDragIndex(null);
                      setOverIndex(null);
                    },
                    onDragEnd: () => {
                      setDragIndex(null);
                      setOverIndex(null);
                    },
                  }}
                />
              );
            }
            return (
              <AnalyticsTile
                key={tile.metric}
                def={def}
                value={values[tile.metric]}
                tile={tile}
                compact={isMobile}
                editing={editing}
                onSize={(size) => patchTile(i, { size })}
                onRemove={() => removeTile(i)}
                onPlan={(plan) => patchTile(i, { plan })}
                dragging={dragIndex === i}
                dropBefore={overIndex === i && dragIndex !== i}
                dragHandlers={{
                  onDragStart: () => setDragIndex(i),
                  onDragOver: (e) => {
                    e.preventDefault();
                    setOverIndex(i);
                  },
                  onDrop: (e) => {
                    e.preventDefault();
                    if (dragIndex != null) move(dragIndex, i);
                    setDragIndex(null);
                    setOverIndex(null);
                  },
                  onDragEnd: () => {
                    setDragIndex(null);
                    setOverIndex(null);
                  },
                }}
              />
            );
          })}
        </div>

        {/* Каталог показателей */}
        {editing && (
          <aside className="flex w-full shrink-0 flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card-sm xl:w-[300px]">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
              <LayoutGrid size={12} /> Добавить показатель
            </div>
            {hidden.length === 0 ? (
              <div className="text-[12.5px] text-muted">
                Все показатели уже на доске.
              </div>
            ) : (
              (["rent", "sales", "service", "buyout", "plan"] as MetricGroup[]).map(
                (g) => {
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
                            <span className="block text-[11.5px] leading-snug text-muted">
                              {m.about}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                },
              )
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
