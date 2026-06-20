import { useState } from "react";
import { ArrowDown, ArrowRight, Check, ChevronDown, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Release } from "@/data/releases";

const MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
function formatDateRu(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_RU[(m ?? 1) - 1]} ${y}`;
}
function pluralRu(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/**
 * Карточка одного релиза в «Что нового»: тёмный hero с крупной версией +
 * счётчиком правок, блок «Что изменилось» (глобальные было→стало) и
 * раскрывающийся полный список правок по разделам. Фирменный язык CRM
 * (ink-hero, синий акцент, green для «стало»).
 */
export function ReleaseCard({
  release,
  defaultOpen = false,
  current = false,
}: {
  release: Release;
  /** Раскрыт ли по умолчанию детальный список. */
  defaultOpen?: boolean;
  /** Пометить как текущую (последнюю) версию. */
  current?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const detailCount = release.changes.reduce((s, g) => s + g.items.length, 0);

  return (
    <section className="flex flex-col gap-4">
      {/* ── HERO: версия + дата + заголовок + счётчик правок ── */}
      <div className="relative overflow-hidden rounded-2xl bg-ink px-5 py-5 text-white shadow-card">
        {/* мягкое синее свечение в углу — фирменный акцент, не AI-градиент */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-blue-600/30 blur-[80px]" />
        <div className="relative flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="shrink-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/55">
              Версия
            </div>
            <div className="font-display text-[44px] font-extrabold leading-none tabular-nums">
              <span className="mr-0.5 align-top text-[24px] text-white/40">v</span>
              {release.version}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {current && (
                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  Текущая
                </span>
              )}
              <span className="text-[12px] font-semibold text-white/60">
                {formatDateRu(release.date)}
              </span>
            </div>
            <h2 className="mt-1.5 font-display text-[18px] font-bold leading-tight text-white">
              {release.title}
            </h2>
          </div>

          <div className="shrink-0 text-right">
            <div className="font-display text-[30px] font-extrabold leading-none tabular-nums">
              {release.commitCount}
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/55">
              {pluralRu(release.commitCount, "правка", "правки", "правок")}
            </div>
          </div>
        </div>
      </div>

      {/* ── ЧТО ИЗМЕНИЛОСЬ: глобальные было → стало ── */}
      <div className="flex flex-col gap-2.5">
        <SectionLabel>Что изменилось</SectionLabel>
        {release.highlights.map((h, i) => (
          <article
            key={h.title}
            className="rounded-2xl border border-border bg-surface p-3.5 shadow-card-sm"
            style={{
              animation: "wnFadeUp .4s ease-out both",
              animationDelay: `${Math.min(i * 55, 330)}ms`,
            }}
          >
            <div className="mb-2.5 flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
              <h3 className="text-[14px] font-bold text-ink">{h.title}</h3>
            </div>
            <div className="grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr]">
              <div className="rounded-xl bg-surface-soft p-3">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-2">
                  Было
                </div>
                <p className="text-[12.5px] leading-relaxed text-muted">
                  {h.before}
                </p>
              </div>
              <div className="flex items-center justify-center text-muted-2">
                <ArrowRight size={16} className="hidden sm:block" />
                <ArrowDown size={16} className="sm:hidden" />
              </div>
              <div className="rounded-xl bg-green-soft/40 p-3 ring-1 ring-inset ring-green-soft">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-green-ink">
                  Стало
                </div>
                <p className="text-[12.5px] leading-relaxed text-ink-2">
                  {h.after}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* ── ПОЛНЫЙ СПИСОК ПРАВОК (раскрывашка) ── */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-2xl border bg-surface px-4 py-3 text-left transition-colors",
            open
              ? "border-blue-200 bg-blue-50/50"
              : "border-border hover:border-blue-200 hover:bg-blue-50/40",
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <ListChecks size={17} />
          </span>
          <span className="flex-1 text-[13.5px] font-bold text-ink">
            Полный список правок
          </span>
          <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[12px] font-bold tabular-nums text-muted">
            {detailCount}
          </span>
          <ChevronDown
            size={18}
            className={cn(
              "shrink-0 text-muted-2 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>

        {open && (
          <div className="grid gap-x-6 gap-y-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2">
            {release.changes.map((g) => (
              <div key={g.group} className="break-inside-avoid">
                <div className="mb-2 flex items-center gap-2">
                  <h4 className="text-[12px] font-bold uppercase tracking-wide text-blue-700">
                    {g.group}
                  </h4>
                  <span className="text-[11px] font-semibold tabular-nums text-muted-2">
                    {g.items.length}
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {g.items.map((it, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-[12.5px] leading-snug text-ink-2"
                    >
                      <Check
                        size={14}
                        className="mt-[3px] shrink-0 text-green-ink"
                      />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <h3 className="text-[13px] font-bold uppercase tracking-wider text-ink-2">
        {children}
      </h3>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
