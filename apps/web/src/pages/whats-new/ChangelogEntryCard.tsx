import { cn } from "@/lib/utils";
import type {
  ChangelogArea,
  ChangelogCategory,
  ChangelogEntry,
} from "@/data/changelog";

const CATEGORY_STYLE: Record<ChangelogCategory, string> = {
  "Новое": "bg-green-soft text-green-ink",
  "Улучшение": "bg-blue-50 text-blue-700",
  "Исправление": "bg-orange-soft text-orange-ink",
  "Дизайн": "bg-purple-soft text-purple-ink",
  "Расчёты": "bg-surface-soft text-ink-2",
};

export function CategoryBadge({ category }: { category: ChangelogCategory }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        CATEGORY_STYLE[category],
      )}
    >
      {category}
    </span>
  );
}

function AreaBadge({ area }: { area: ChangelogArea }) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface-soft px-2 py-0.5 text-[11px] font-semibold text-muted">
      {area}
    </span>
  );
}

export function ChangelogEntryCard({ entry }: { entry: ChangelogEntry }) {
  return (
    <article
      id={entry.id}
      className="rounded-2xl border border-border bg-surface p-5 shadow-card-sm"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <CategoryBadge category={entry.category} />
        {entry.areas.map((a) => (
          <AreaBadge key={a} area={a} />
        ))}
        {entry.version && (
          <span className="ml-auto text-[11px] font-bold text-muted-2">
            {entry.version}
          </span>
        )}
      </div>

      <h3 className="mb-3 text-[16px] font-bold text-ink">{entry.title}</h3>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-surface-soft p-3">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-2">
            Было
          </div>
          <p className="text-[13px] leading-relaxed text-muted">
            {entry.before}
          </p>
        </div>
        <div className="rounded-xl bg-green-soft/40 p-3 ring-1 ring-green-soft">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-green-ink">
            Стало
          </div>
          <p className="text-[13px] leading-relaxed text-ink-2">
            {entry.after}
          </p>
        </div>
      </div>
    </article>
  );
}
