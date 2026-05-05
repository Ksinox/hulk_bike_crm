import { cn } from "@/lib/utils";
import type { ChangelogEntry } from "@/data/changelog";
import { CategoryBadge } from "./ChangelogEntryCard";

// Компактная строка-заголовок. По наведению справа от строки появляется
// мини-карточка с двумя блоками «Было / Стало». Аналог hover-предпросмотра
// плиток парка, но для записи changelog'а.
export function ChangelogRow({ entry }: { entry: ChangelogEntry }) {
  return (
    <div className="group/row relative">
      <article
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-xl border border-transparent bg-surface px-3 py-2.5 shadow-card-sm transition-colors",
          "hover:border-border hover:bg-blue-50/40",
        )}
      >
        <CategoryBadge category={entry.category} size="sm" />
        <span className="text-[14px] font-semibold text-ink">
          {entry.title}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-2">
          {entry.areas.map((a) => (
            <span
              key={a}
              className="rounded-full bg-surface-soft px-2 py-0.5 font-semibold"
            >
              {a}
            </span>
          ))}
          {entry.version && (
            <span className="font-bold text-muted">{entry.version}</span>
          )}
        </span>
      </article>

      <HoverPanel entry={entry} />
    </div>
  );
}

function HoverPanel({ entry }: { entry: ChangelogEntry }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute left-1/2 top-full z-40 mt-2 w-[min(560px,calc(100vw-160px))] -translate-x-1/2",
        "rounded-2xl border border-border bg-surface p-4 shadow-card-lg",
        "opacity-0 transition-opacity duration-150 ease-out",
        "group-hover/row:opacity-100",
      )}
      role="tooltip"
    >
      <div className="mb-2 flex items-center gap-2">
        <CategoryBadge category={entry.category} size="sm" />
        <span className="text-[13px] font-bold text-ink">{entry.title}</span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="rounded-xl bg-surface-soft p-3">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-2">
            Было
          </div>
          <p className="text-[12px] leading-relaxed text-muted">
            {entry.before}
          </p>
        </div>
        <div className="rounded-xl bg-green-soft/40 p-3 ring-1 ring-green-soft">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-green-ink">
            Стало
          </div>
          <p className="text-[12px] leading-relaxed text-ink-2">
            {entry.after}
          </p>
        </div>
      </div>
    </div>
  );
}
