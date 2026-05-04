import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Topbar } from "@/pages/dashboard/Topbar";
import {
  changelog,
  type ChangelogCategory,
  type ChangelogEntry,
} from "@/data/changelog";
import { cn } from "@/lib/utils";
import { CategoryBadge, ChangelogEntryCard } from "./ChangelogEntryCard";
import { markChangelogSeen } from "./useUnreadChangelog";

const CATEGORIES: (ChangelogCategory | "Все")[] = [
  "Все",
  "Новое",
  "Улучшение",
  "Исправление",
  "Дизайн",
  "Расчёты",
];

// Порядок категорий на странице — сверху самые «громкие».
const CATEGORY_ORDER: ChangelogCategory[] = [
  "Новое",
  "Улучшение",
  "Дизайн",
  "Исправление",
  "Расчёты",
];

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
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

  // Группировка: сначала по категории (в фиксированном порядке), внутри —
  // от новой даты к старой. Заказчик хочет видеть «всё новое подряд,
  // потом всё про дизайн» и т.д.
  const groups = useMemo(() => {
    const map = new Map<ChangelogCategory, ChangelogEntry[]>();
    for (const e of filtered) {
      const arr = map.get(e.category) ?? [];
      arr.push(e);
      map.set(e.category, arr);
    }
    return CATEGORY_ORDER.flatMap((cat) => {
      const list = map.get(cat);
      if (!list || list.length === 0) return [];
      const sorted = [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
      return [{ category: cat, entries: sorted }];
    });
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

      <div className="flex flex-col gap-6">
        {groups.map(({ category, entries }) => (
          <section key={category} className="flex flex-col gap-3">
            <div className="flex items-center gap-3 px-1">
              <CategoryBadge category={category} />
              <span className="text-[12px] font-semibold text-muted-2">
                {entries.length}{" "}
                {pluralRu(entries.length, "улучшение", "улучшения", "улучшений")}
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
