import { useEffect, useMemo, useRef, useState } from "react";
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

function sectionId(date: string): string {
  return `whats-new-date-${date}`;
}

export function WhatsNew() {
  useEffect(() => {
    markChangelogSeen();
  }, []);

  // Все уникальные даты — отсортированы от свежей к старой.
  const dates = useMemo(() => {
    const set = new Set(changelog.map((e) => e.date));
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, []);

  const [activeDate, setActiveDate] = useState<string>(dates[0] ?? "");
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Scrollspy: при скролле подсвечиваем дату той секции, чей верх
  // ближе всего к якорю (120px от верха окна, под Topbar'ом). Активной
  // считаем самую нижнюю из тех, чей верх уже прошёл якорь.
  useEffect(() => {
    if (dates.length === 0) return;
    const ANCHOR_Y = 120;
    let raf = 0;
    const update = () => {
      raf = 0;
      let bestDate = dates[0] ?? "";
      let bestTop = -Infinity;
      for (const [date, el] of sectionRefs.current) {
        const top = el.getBoundingClientRect().top;
        if (top <= ANCHOR_Y && top > bestTop) {
          bestTop = top;
          bestDate = date;
        }
      }
      setActiveDate((prev) => (prev === bestDate ? prev : bestDate));
    };
    const onScroll = () => {
      if (raf === 0) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [dates]);

  const handleDateClick = (date: string) => {
    setActiveDate(date);
    const el = sectionRefs.current.get(date);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
        {/* Sticky-навигатор по датам — обновляется при скролле. */}
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
                  onClick={() => handleDateClick(d)}
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

        {/* Все даты, рендерятся подряд — скроллим как Notion-страницу. */}
        <section className="flex min-w-0 flex-1 flex-col gap-8">
          {/* Мобильный chip-селектор — заменяет сайдбар на узких экранах. */}
          <div className="flex flex-wrap gap-1.5 md:hidden">
            {dates.map((d) => {
              const short = formatDateShort(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleDateClick(d)}
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

          {dates.map((date) => (
            <DateSection
              key={date}
              date={date}
              registerRef={(el) => {
                if (el) sectionRefs.current.set(date, el);
                else sectionRefs.current.delete(date);
              }}
            />
          ))}
        </section>
      </div>
    </main>
  );
}

function DateSection({
  date,
  registerRef,
}: {
  date: string;
  registerRef: (el: HTMLElement | null) => void;
}) {
  const entries = useMemo(
    () => changelog.filter((e) => e.date === date),
    [date],
  );
  const versionsForDate = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) if (e.version) set.add(e.version);
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [entries]);

  const groups = useMemo(() => {
    const map = new Map<ChangelogCategory, ChangelogEntry[]>();
    for (const e of entries) {
      const arr = map.get(e.category) ?? [];
      arr.push(e);
      map.set(e.category, arr);
    }
    return CATEGORY_ORDER.flatMap((cat) => {
      const list = map.get(cat);
      if (!list || list.length === 0) return [];
      return [{ category: cat, entries: list }];
    });
  }, [entries]);

  return (
    <section
      id={sectionId(date)}
      data-date={date}
      ref={registerRef}
      className="flex scroll-mt-4 flex-col gap-4"
    >
      <div className="rounded-2xl bg-ink px-5 py-3 text-white shadow-card">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
          Обновление
        </div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-3">
          <h2 className="font-display text-[24px] font-extrabold leading-none">
            {formatDateRu(date)}
          </h2>
          {versionsForDate.length > 0 && (
            <span className="text-[12px] font-bold text-white/70">
              {versionsForDate.join(" · ")}
            </span>
          )}
          <span className="ml-auto text-[12px] font-semibold text-white/70">
            {entries.length}{" "}
            {pluralRu(entries.length, "улучшение", "улучшения", "улучшений")}
          </span>
        </div>
      </div>

      {groups.map(({ category, entries: groupEntries }) => (
        <div key={category} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 px-1">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-ink-2">
              {category}
            </h3>
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-semibold text-muted-2">
              {groupEntries.length}{" "}
              {pluralRu(groupEntries.length, "улучшение", "улучшения", "улучшений")}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {groupEntries.map((e) => (
              <ChangelogRow key={e.id} entry={e} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
