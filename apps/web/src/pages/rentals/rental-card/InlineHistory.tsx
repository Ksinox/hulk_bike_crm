/**
 * InlineHistory — компактная подсказка «последние события» под календарём
 * в карточке аренды. Показывает 3-5 строк, кнопка «Все события →» открывает
 * полный SideDrawer (история).
 *
 * v0.7.15: рендер строк унифицирован — используем общий
 * <ActivityEventRow compact> (единый визуальный язык «было → стало» с
 * иконками, тот же что на дашборде и в полной ленте). Локальные функции
 * formatActivityShort / renderDiffLine / actionMeta удалены.
 */
import { Fragment, type ReactNode } from "react";
import { ArrowRight, History } from "lucide-react";
import type { ApiActivityItem } from "@/lib/api/activity";
import { ActivityEventRow } from "@/components/ActivityEventRow";

export function InlineHistory({
  items,
  loading,
  onExpand,
  limit = 5,
  afterFirst,
}: {
  items: ApiActivityItem[];
  loading?: boolean;
  onExpand: () => void;
  limit?: number;
  /**
   * Слот, который рендерится СРАЗУ под самым свежим событием (items[0]).
   * Используется для «Откатить последнее действие» — кнопка живёт прямо
   * в хронологии на последнем действии, а не отдельной плашкой над картой.
   */
  afterFirst?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-surface border border-border shadow-card-sm overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-muted-2 inline-flex items-center gap-1.5">
            <History size={11} /> Последние события
          </div>
        </div>
        <button
          type="button"
          onClick={onExpand}
          className="inline-flex items-center gap-1 rounded-full bg-surface-soft hover:bg-ink hover:text-white px-2.5 py-1 text-[11px] font-bold text-ink-2 shrink-0 transition-colors"
        >
          Все события <ArrowRight size={11} />
        </button>
      </div>
      <div>
        {loading ? (
          <div className="px-4 py-4 text-[12px] text-muted">Загружаем…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-4 text-[12px] text-muted">
            Событий ещё нет. Они появятся автоматически по мере работы с арендой.
          </div>
        ) : (
          <div className="px-3 py-2 flex flex-col gap-0.5">
            {items.slice(0, limit).map((it, i) => (
              <Fragment key={it.id}>
                <ActivityEventRow item={it} compact />
                {i === 0 && afterFirst}
              </Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
