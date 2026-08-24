import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, Maximize2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  PROGRESS_PERIOD,
  progressGroups,
  progressItems,
  progressSummary,
  type ProgressItem,
  type ProgressStatus,
  type ProgressStep,
  type StoryImage,
} from "@/data/progress";

/**
 * «Развитие» — презентационная страница плана работ для заказчика.
 *
 * Подача: не список задач из админки, а разворот делового отчёта —
 * тёмный титул с кольцом готовности, крупная статистика, главы-разделы
 * и «трек» работ: пункты нанизаны на вертикальную линию времени.
 *
 * Один компонент на десктоп и мобилу (адаптив через sm:/lg:), чтобы версии
 * не расходились. Данные — `@/data/progress`.
 */

const MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
function fmtDate(iso: string, withYear = false): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_RU[(m ?? 1) - 1]}${withYear ? ` ${y}` : ""}`;
}
function pluralRu(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const STATUS_META: Record<
  ProgressStatus,
  { label: string; pill: string; dot: string; ring: string }
> = {
  accepted: {
    label: "Принято",
    pill: "bg-green-soft text-green-ink",
    dot: "bg-green-ink",
    ring: "ring-green-soft",
  },
  done: {
    label: "Готово, на проверке",
    pill: "bg-blue-50 text-blue-700",
    dot: "bg-blue-600",
    ring: "ring-blue-100",
  },
  in_progress: {
    label: "В работе",
    pill: "bg-amber-100 text-amber-800",
    dot: "bg-amber-500",
    ring: "ring-amber-100",
  },
  planned: {
    label: "Запланировано",
    pill: "bg-surface-soft text-muted",
    dot: "bg-muted-2/40",
    ring: "ring-border",
  },
};

/** Тонкая точечная текстура для тёмного титула — глубина без «AI-градиента». */
const DOT_TEXTURE = {
  backgroundImage:
    "radial-gradient(rgba(255,255,255,0.16) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

export function ProgressBoard() {
  const s = useMemo(() => progressSummary(), []);
  const [open, setOpen] = useState<Set<string>>(new Set());
  // Лайтбокс: клик по скриншоту → полный экран.
  const [zoom, setZoom] = useState<StoryImage | null>(null);
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col">
      <style>{`@keyframes wnFadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* ─────────────── ТИТУЛ ─────────────── */}
      <header
        className="relative overflow-hidden rounded-3xl bg-ink px-6 py-8 text-white shadow-card sm:px-10 sm:py-12"
        style={{ animation: "wnFadeUp .5s ease-out both" }}
      >
        <div className="pointer-events-none absolute inset-0" style={DOT_TEXTURE} />
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-blue-600/35 blur-[90px]" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-64 w-64 rounded-full bg-blue-700/20 blur-[90px]" />

        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <div className="min-w-0 max-w-2xl">
            <div className="flex items-center gap-2.5">
              <span className="h-px w-8 bg-blue-400/70" />
              <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-blue-300">
                План работ
              </span>
            </div>
            <h1 className="mt-4 font-display text-[34px] font-extrabold leading-[1.05] tracking-tight sm:text-[48px] lg:text-[56px]">
              Порядок
              <br />
              улучшений
            </h1>
            <p className="mt-5 text-[15px] font-semibold text-white/80 sm:text-[17px]">
              {fmtDate(PROGRESS_PERIOD.from)} — {fmtDate(PROGRESS_PERIOD.to, true)}
            </p>
            <p className="mt-2 max-w-md text-[13px] leading-relaxed text-white/50">
              {s.done > 0 ? (
                <>
                  <b className="text-white/85">
                    {s.done} {pluralRu(s.done, "пункт", "пункта", "пунктов")}
                  </b>{" "}
                  {pluralRu(s.done, "готов и ждёт", "готовы и ждут", "готовы и ждут")}{" "}
                  вашей проверки — у каждого история «было → стало» со
                  скриншотами. Принятое переносится в рабочую систему.
                </>
              ) : (
                <>
                  {s.total} {pluralRu(s.total, "пункт", "пункта", "пунктов")} в
                  работе. Каждый проходит проверку на тестовом окружении и
                  переносится в рабочую систему только после согласования.
                </>
              )}
            </p>
          </div>

          <ProgressRing percent={s.percent} />
        </div>
      </header>

      {/* ─────────────── СТАТИСТИКА ─────────────── */}
      <div
        className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border sm:grid-cols-4"
        style={{ animation: "wnFadeUp .5s ease-out both", animationDelay: "80ms" }}
      >
        <Stat value={s.accepted} label="Принято" tone="green" />
        <Stat value={s.done} label="На проверке" tone="blue" />
        <Stat value={s.inProgress} label="В работе" tone="amber" />
        <Stat value={s.planned} label="Запланировано" tone="muted" />
      </div>

      {/* ─────────────── КАК ПРИНИМАТЬ РАБОТУ ─────────────── */}
      {s.done > 0 && (
        <div
          className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/50 p-5 sm:p-6"
          style={{ animation: "wnFadeUp .5s ease-out both", animationDelay: "120ms" }}
        >
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-blue-700">
            Как принимать работу
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              {
                n: "1",
                t: "Откройте пункт",
                d: "Внутри — короткая история со скриншотами: как было, что нажимали, как стало.",
              },
              {
                n: "2",
                t: "Проверьте вживую",
                d: "Всё уже работает на тестовой версии CRM — повторите шаги из истории своими руками.",
              },
              {
                n: "3",
                t: "Напишите «принял»",
                d: "Сообщение в чат — «пункт N принял» — и он уезжает в рабочую систему.",
              },
            ].map((st) => (
              <div key={st.n} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 font-display text-[14px] font-extrabold text-white">
                  {st.n}
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-bold text-ink">{st.t}</div>
                  <div className="mt-0.5 text-[12px] leading-relaxed text-muted">
                    {st.d}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────── ГЛАВЫ ─────────────── */}
      <div className="mt-12 flex flex-col gap-14">
        {progressGroups.map((g, gi) => {
          const items = progressItems.filter((i) => i.group === g.key);
          if (items.length === 0) return null;
          const acc = items.filter((i) => i.status === "accepted").length;
          return (
            <section
              key={g.key}
              style={{
                animation: "wnFadeUp .5s ease-out both",
                animationDelay: `${Math.min(140 + gi * 70, 450)}ms`,
              }}
            >
              {/* Шапка главы */}
              <div className="flex items-start gap-4 sm:gap-6">
                <span className="select-none font-display text-[40px] font-extrabold leading-none text-border-strong sm:text-[54px]">
                  {String(gi + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <h2 className="font-display text-[19px] font-extrabold leading-tight text-ink sm:text-[23px]">
                    {g.title}
                  </h2>
                  {g.hint && (
                    <p className="mt-1 text-[13px] leading-snug text-muted">
                      {g.hint}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-surface-soft px-3 py-1 text-[12px] font-bold tabular-nums text-muted">
                  {acc}<span className="text-muted-2">/{items.length}</span>
                </span>
              </div>

              {/* Трек: линия времени + пункты */}
              <div className="relative mt-5 pl-7 sm:pl-9">
                <span className="absolute bottom-3 left-[9px] top-3 w-px bg-border sm:left-[11px]" />
                <div className="flex flex-col gap-2">
                  {items.map((it) => (
                    <ItemCard
                      key={it.id}
                      item={it}
                      expanded={open.has(it.id)}
                      onToggle={() => toggle(it.id)}
                      onZoom={setZoom}
                    />
                  ))}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <footer className="mt-14 border-t border-border pt-5 text-[12px] leading-relaxed text-muted-2">
        Страница обновляется по мере выполнения работ. По завершённым пунктам
        доступны материалы «было / стало» — любой скриншот открывается на весь
        экран по клику.
      </footer>

      {zoom && <Lightbox img={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

/* ─────────────── Лайтбокс скриншота ─────────────── */

function Lightbox({ img, onClose }: { img: StoryImage; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Блокируем прокрутку страницы под оверлеем.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex cursor-zoom-out flex-col items-center justify-center gap-3 bg-ink/90 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть"
        className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25"
      >
        <X size={20} />
      </button>
      <img
        src={img.src}
        alt={img.label ?? "скриншот"}
        className="max-h-[86vh] max-w-full rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      {img.label && (
        <div className="max-w-2xl text-center text-[13px] leading-snug text-white/80">
          {img.label}
        </div>
      )}
    </div>,
    document.body,
  );
}

/* ─────────────── Кольцо готовности ─────────────── */

function ProgressRing({ percent }: { percent: number }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * C;
  return (
    <div className="flex shrink-0 items-center justify-center gap-5 lg:justify-end">
      <div className="relative h-[132px] w-[132px] sm:h-[148px] sm:w-[148px]">
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
          <circle
            cx="64"
            cy="64"
            r={R}
            fill="none"
            stroke="rgba(255,255,255,0.14)"
            strokeWidth="9"
          />
          {/* При 0 % дугу не рисуем: скруглённый конец давал бы одинокую
              точку на окружности — читается как артефакт. */}
          {percent > 0 && (
            <circle
              cx="64"
              cy="64"
              r={R}
              fill="none"
              stroke="url(#ringGrad)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${C}`}
              style={{
                transition: "stroke-dasharray .9s cubic-bezier(.22,1,.36,1)",
              }}
            />
          )}
          <defs>
            <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#60A5FA" />
              <stop offset="100%" stopColor="#34D399" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-display text-[34px] font-extrabold leading-none tabular-nums sm:text-[38px]">
            {percent}
            <span className="text-[18px] text-white/45">%</span>
          </div>
          <div className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.18em] text-white/50">
            готовность
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Статистика ─────────────── */

const STAT_TONE = {
  green: "text-green-ink",
  blue: "text-blue-700",
  amber: "text-amber-600",
  muted: "text-muted-2",
} as const;

function Stat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: keyof typeof STAT_TONE;
}) {
  return (
    <div className="bg-surface px-4 py-4 sm:px-5 sm:py-5">
      <div
        className={cn(
          "font-display text-[28px] font-extrabold leading-none tabular-nums sm:text-[32px]",
          STAT_TONE[tone],
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-2">
        {label}
      </div>
    </div>
  );
}

/* ─────────────── Пункт на треке ─────────────── */

function ItemCard({
  item,
  expanded,
  onToggle,
  onZoom,
}: {
  item: ProgressItem;
  expanded: boolean;
  onToggle: () => void;
  onZoom: (img: StoryImage) => void;
}) {
  const meta = STATUS_META[item.status];
  const hasDetail = !!(
    item.quote ||
    item.note ||
    item.shots?.length ||
    item.story?.length
  );
  return (
    <div className="relative">
      {/* Маркер на линии времени */}
      <span
        className={cn(
          "absolute -left-7 top-[18px] h-[9px] w-[9px] rounded-full ring-4 ring-surface sm:-left-9",
          meta.dot,
        )}
      />

      <div
        className={cn(
          "overflow-hidden rounded-2xl border bg-surface transition-all duration-200",
          expanded
            ? "border-blue-200 shadow-card-sm"
            : "border-border hover:border-blue-200/70 hover:shadow-card-sm",
        )}
      >
        <button
          type="button"
          onClick={hasDetail ? onToggle : undefined}
          aria-expanded={expanded}
          disabled={!hasDetail}
          className="flex w-full items-center gap-3 px-3.5 py-3.5 text-left sm:gap-4 sm:px-5"
        >
          <span className="w-7 shrink-0 font-display text-[13px] font-extrabold tabular-nums text-muted-2 sm:w-8 sm:text-[14px]">
            {item.id}
          </span>

          <span className="min-w-0 flex-1 text-[13.5px] font-bold leading-snug text-ink sm:text-[14.5px]">
            {item.title}
          </span>

          <span
            className={cn(
              "hidden shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold sm:inline-flex",
              meta.pill,
            )}
          >
            {item.status === "in_progress" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : item.status === "planned" ? null : (
              <Check size={12} />
            )}
            {meta.label}
          </span>

          {hasDetail && (
            <ChevronDown
              size={17}
              className={cn(
                "shrink-0 text-muted-2 transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
          )}
        </button>

        {expanded && hasDetail && (
          <div className="border-t border-border px-3.5 pb-4 pt-3.5 sm:px-5">
            {/* На мобиле статус пилюлей внутри — в шапке его нет */}
            <span
              className={cn(
                "mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold sm:hidden",
                meta.pill,
              )}
            >
              {item.status === "in_progress" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : item.status === "planned" ? null : (
                <Check size={12} />
              )}
              {meta.label}
            </span>

            {item.quote && (
              <blockquote className="border-l-2 border-blue-200 pl-4 text-[13px] italic leading-relaxed text-muted">
                {item.quote}
              </blockquote>
            )}

            {item.note && (
              <p className="mt-3 rounded-xl bg-blue-50/70 px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
                {item.note}
              </p>
            )}

            {/* Пошаговая история: контекст → действие → проблема → исправление */}
            {item.story && item.story.length > 0 && (
              <div className="mt-4 flex flex-col">
                {item.story.map((st, i) => (
                  <StoryStepRow
                    key={i}
                    step={st}
                    n={i + 1}
                    last={i === item.story!.length - 1}
                    onZoom={onZoom}
                  />
                ))}
              </div>
            )}

            {item.shots?.map((sh, i) => (
              <figure key={i} className="mt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {sh.before && (
                    <Shot
                      src={sh.before}
                      label="Было"
                      tone="muted"
                      onZoom={onZoom}
                    />
                  )}
                  {sh.after && (
                    <Shot
                      src={sh.after}
                      label="Стало"
                      tone="green"
                      onZoom={onZoom}
                    />
                  )}
                </div>
                {sh.caption && (
                  <figcaption className="mt-2 text-[11.5px] text-muted-2">
                    {sh.caption}
                  </figcaption>
                )}
              </figure>
            ))}

            {/* CTA приёмки: пункт готов — что сделать, чтобы он уехал в прод */}
            {item.status === "done" && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check size={13} strokeWidth={3} />
                </span>
                <p className="text-[12.5px] leading-relaxed text-ink-2">
                  <b>Готово к вашей проверке.</b> Повторите шаги на тестовой
                  версии CRM — и, если всё устраивает, напишите в чат:{" "}
                  <b>«пункт {item.id} принял»</b>. После этого изменение
                  переедет в рабочую систему.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────── Шаг истории ─────────────── */

const STEP_TAG = {
  bug: {
    label: "Проблема",
    badge: "bg-red-soft text-red-ink",
    ring: "bg-red-ink text-white",
  },
  fix: {
    label: "После исправления",
    badge: "bg-green-soft text-green-ink",
    ring: "bg-green-ink text-white",
  },
} as const;

function StoryStepRow({
  step,
  n,
  last,
  onZoom,
}: {
  step: ProgressStep;
  n: number;
  last: boolean;
  onZoom: (img: StoryImage) => void;
}) {
  const tag = step.tag ? STEP_TAG[step.tag] : null;
  return (
    <div className="relative flex gap-3 pb-5 sm:gap-4">
      {/* Нумерация шага на собственной мини-линии */}
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12.5px] font-extrabold",
            tag ? tag.ring : "bg-ink text-white",
          )}
        >
          {n}
        </span>
        {!last && <span className="w-px flex-1 bg-border" />}
      </div>

      <div className="min-w-0 flex-1 pt-0.5">
        {tag && (
          <span
            className={cn(
              "mb-1.5 inline-block rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
              tag.badge,
            )}
          >
            {tag.label}
          </span>
        )}
        <p className="text-[13px] leading-relaxed text-ink-2">{step.text}</p>

        {step.imgs && step.imgs.length > 0 && (
          <div
            className={cn(
              "mt-2.5 grid gap-2.5",
              step.imgs.length > 1 && "sm:grid-cols-2",
            )}
          >
            {step.imgs.map((img) => (
              <figure key={img.src} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onZoom(img)}
                  title="Открыть на весь экран"
                  className="group relative block w-full cursor-zoom-in overflow-hidden rounded-xl border border-border bg-surface shadow-card-sm transition-shadow hover:shadow-card"
                >
                  <img
                    src={img.src}
                    alt={img.label ?? ""}
                    loading="lazy"
                    className="max-h-[300px] w-full bg-surface object-contain"
                  />
                  <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-ink/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <Maximize2 size={14} />
                  </span>
                </button>
                {img.label && (
                  <figcaption className="mt-1 text-[11px] leading-snug text-muted-2">
                    {img.label}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Shot({
  src,
  label,
  tone,
  onZoom,
}: {
  src: string;
  label: string;
  tone: "muted" | "green";
  onZoom: (img: StoryImage) => void;
}) {
  return (
    <div>
      <div
        className={cn(
          "mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em]",
          tone === "green" ? "text-green-ink" : "text-muted-2",
        )}
      >
        {label}
      </div>
      <button
        type="button"
        onClick={() => onZoom({ src, label })}
        title="Открыть на весь экран"
        className="group relative block w-full cursor-zoom-in overflow-hidden rounded-xl border border-border bg-surface shadow-card-sm"
      >
        <img src={src} alt={label} loading="lazy" className="w-full" />
        <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-ink/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <Maximize2 size={14} />
        </span>
      </button>
    </div>
  );
}
