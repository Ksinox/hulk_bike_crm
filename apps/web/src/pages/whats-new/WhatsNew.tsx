import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Topbar } from "@/pages/dashboard/Topbar";
import { changelog, type ChangelogCategory } from "@/data/changelog";
import { cn } from "@/lib/utils";
import { ChangelogEntryCard } from "./ChangelogEntryCard";
import { markChangelogSeen } from "./useUnreadChangelog";

const CATEGORIES: (ChangelogCategory | "Все")[] = [
  "Все",
  "Новое",
  "Улучшение",
  "Исправление",
  "Дизайн",
  "Расчёты",
];

const MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function formatDateRu(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_RU[(m ?? 1) - 1]} ${y}`;
}

export function WhatsNew() {
  const [filter, setFilter] = useState<ChangelogCategory | "Все">("Все");

  useEffect(() => {
    markChangelogSeen();
  }, []);

  const filtered = useMemo(
    () =>
      filter === "Все"
        ? changelog
        : changelog.filter((e) => e.category === filter),
    [filter],
  );

  // Группировка по дате+версии (одна группа на день, версия в подзаголовке).
  const groups = useMemo(() => {
    const map = new Map<string, typeof changelog>();
    for (const e of filtered) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[0] < b[0] ? 1 : -1,
    );
  }, [filtered]);

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-[34px] font-extrabold leading-none text-ink">
            <Sparkles size={28} className="text-blue-600" />
            Что нового
          </h1>
          <div className="mt-1.5 text-[13px] text-muted-2">
            Изменения в CRM, объяснённые простым языком — без терминов.
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                filter === c
                  ? "bg-ink text-white"
                  : "bg-surface text-muted ring-1 ring-border hover:bg-blue-50 hover:text-blue-700",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </header>

      {groups.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center text-[13px] text-muted-2">
          В этой категории улучшений пока нет.
        </div>
      )}

      <div className="flex flex-col gap-5">
        {groups.map(([date, entries]) => (
          <section key={date} className="flex flex-col gap-3">
            <div className="flex items-baseline gap-3 px-1">
              <h2 className="text-[18px] font-bold text-ink">
                {formatDateRu(date)}
              </h2>
              <span className="text-[12px] font-semibold text-muted-2">
                {entries.length}{" "}
                {entries.length === 1
                  ? "улучшение"
                  : entries.length < 5
                    ? "улучшения"
                    : "улучшений"}
              </span>
            </div>
            {entries.map((e) => (
              <ChangelogEntryCard key={e.id} entry={e} />
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
