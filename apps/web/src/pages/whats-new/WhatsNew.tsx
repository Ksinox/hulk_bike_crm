import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Topbar } from "@/pages/dashboard/Topbar";
import {
  changelog,
  type ChangelogCategory,
  type ChangelogEntry,
} from "@/data/changelog";
import { cn } from "@/lib/utils";
import { ChangelogRow } from "./ChangelogRow";
import { markChangelogSeen } from "./useUnreadChangelog";

// Порядок категорий внутри одной даты — сверху самые «громкие».
const CATEGORY_ORDER: ChangelogCategory[] = [
  "Новое",
  "Улучшение",
  "Дизайн",
  "Исправление",
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

function formatDateShort(iso: string): { day: string; month: string; year: string } {
  const [y, m, d] = iso.split("-").map(Number);
  return {
    day: String(d ?? 0).padStart(2, "0"),
    month: (MONTHS_RU[(m ?? 1) - 1] ?? "").slice(0, 3),
    year: String(y ?? ""),
  };
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function WhatsNew() {
  useEffect(() => {
    markChangelogSeen();
  }, []);

  // Все уникальные даты в changelog'е, отсортированы от свежей к старой.
  const dates = useMemo(() => {
    const set = new Set(changelog.map((e) => e.date));
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, []);

  const [activeDate, setActiveDate] = useState<string>(dates[0] ?? "");

  // Записи активной даты, сгруппированы по категории в фиксированном порядке.
  const groups = useMemo(() => {
    const onDate = changelog.filter((e) => e.date === activeDate);
    const map = new Map<ChangelogCategory, ChangelogEntry[]>();
    for (const e of onDate) {
      const arr = map.get(e.category) ?? [];
      arr.push(e);
      map.set(e.category, arr);
    }
    return CATEGORY_ORDER.flatMap((cat) => {
      const list = map.get(cat);
      if (!list || list.length === 0) return [];
      return [{ category: cat, entries: list }];
    });
  }, [activeDate]);

  const versionsForDate = useMemo(() => {
    const set = new Set<string>();
    for (const e of changelog) {
      if (e.date === activeDate && e.version) set.add(e.version);
    }
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [activeDate]);

  const totalForDate = changelog.filter((e) => e.date === activeDate).length;

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />

      <header>
        <h1 className="flex items-center gap-2 font-display text-[34px] font-extrabold leading-none text-ink">
          <Sparkles size={28} className="text-blue-600" />
          Что нового
        </h1>
        <div className="mt-1.5 text-[13px] text-muted-2">
          Изменения в CRM, объяснённые простым языком — без терминов.
          Наведите на любое улучшение, чтобы увидеть «Было / Стало».
        </div>
      </header>

      <div className="flex min-w-0 flex-1 gap-4">
        {/* Sticky-сайдбар со списком дат — закреплённый «патч» как в Доте. */}
        <aside className="hidden w-[200px] flex-shrink-0 md:block">
          <div className="sticky top-4 flex flex-col gap-1.5">
            <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-2">
              Обновления
            </div>
            {dates.map((d) => {
              const short = formatDateShort(d);
              const isActive = d === activeDate;
              const count = changelog.filter((e) => e.date === d).length;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setActiveDate(d)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                    isActive
                      ? "bg-ink text-white shadow-card-sm"
                      : "text-muted hover:bg-surface-soft hover:text-ink-2",
                  )}
                >
                  <div className="flex flex-col leading-tight">
                    <span
                      className={cn(
                        "font-display text-[18px] font-extrabold tabular-nums",
                        isActive ? "text-white" : "text-ink",
                      )}
                    >
                      {short.day} {short.month}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-semibold",
                        isActive ? "text-white/70" : "text-muted-2",
                      )}
                    >
                      {short.year} · {count}{" "}
                      {pluralRu(count, "запись", "записи", "записей")}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Основная колонка с записями активной даты. */}
        <section className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="rounded-2xl bg-ink px-5 py-3 text-white shadow-card">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
              Обновление
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-3">
              <h2 className="font-display text-[24px] font-extrabold leading-none">
                {formatDateRu(activeDate)}
              </h2>
              {versionsForDate.length > 0 && (
                <span className="text-[12px] font-bold text-white/70">
                  {versionsForDate.join(" · ")}
                </span>
              )}
              <span className="ml-auto text-[12px] font-semibold text-white/70">
                {totalForDate}{" "}
                {pluralRu(totalForDate, "улучшение", "улучшения", "улучшений")}
              </span>
            </div>
          </div>

          {/* Мобильный селектор дат — на маленьких экранах вместо сайдбара. */}
          <div className="flex flex-wrap gap-1.5 md:hidden">
            {dates.map((d) => {
              const short = formatDateShort(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setActiveDate(d)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                    d === activeDate
                      ? "bg-ink text-white"
                      : "bg-surface text-muted ring-1 ring-border",
                  )}
                >
                  {short.day} {short.month}
                </button>
              );
            })}
          </div>

          {groups.length === 0 && (
            <div className="rounded-2xl border border-border bg-surface p-8 text-center text-[13px] text-muted-2">
              За этот день записей нет.
            </div>
          )}

          {groups.map(({ category, entries }) => (
            <section key={category} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-3 px-1">
                <h3 className="text-[13px] font-bold uppercase tracking-wider text-ink-2">
                  {category}
                </h3>
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-semibold text-muted-2">
                  {entries.length}{" "}
                  {pluralRu(entries.length, "улучшение", "улучшения", "улучшений")}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {entries.map((e) => (
                  <ChangelogRow key={e.id} entry={e} />
                ))}
              </div>
            </section>
          ))}
        </section>
      </div>
    </main>
  );
}
