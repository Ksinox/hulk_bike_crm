import { useEffect, useMemo } from "react";
import {
  changelog,
  type ChangelogCategory,
  type ChangelogEntry,
} from "@/data/changelog";
import { markChangelogSeen } from "@/pages/whats-new/useUnreadChangelog";
import { cn } from "@/lib/utils";

const CATEGORY_CLS: Record<ChangelogCategory, string> = {
  Новое: "bg-green-soft text-green-ink",
  Улучшение: "bg-blue-50 text-blue-600",
  Дизайн: "bg-purple-soft text-purple-ink",
  Исправление: "bg-orange-soft text-orange-ink",
  Расчёты: "bg-surface-soft text-muted",
};

const MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function formatDateRu(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_RU[(m ?? 1) - 1]} ${y}`;
}

export function MobileWhatsNew() {
  useEffect(() => {
    markChangelogSeen();
  }, []);

  const groups = useMemo(() => {
    const byDate = new Map<string, ChangelogEntry[]>();
    for (const e of changelog) {
      const arr = byDate.get(e.date) ?? [];
      arr.push(e);
      byDate.set(e.date, arr);
    }
    return [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {groups.map(([date, entries]) => (
        <section key={date}>
          <div className="mb-2 px-1 text-[13px] font-bold text-muted">
            {formatDateRu(date)}
          </div>
          <div className="flex flex-col gap-2">
            {entries.map((e) => (
              <article key={e.id} className="rounded-2xl bg-surface p-3.5 shadow-card-sm">
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold",
                      CATEGORY_CLS[e.category],
                    )}
                  >
                    {e.category}
                  </span>
                  {e.areas.slice(0, 2).map((a) => (
                    <span key={a} className="text-[11px] text-muted-2">
                      {a}
                    </span>
                  ))}
                </div>
                <h3 className="text-[14px] font-bold leading-snug text-ink">
                  {e.title}
                </h3>
                {e.after && (
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">
                    {e.after}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
