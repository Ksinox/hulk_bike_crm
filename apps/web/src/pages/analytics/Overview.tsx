import {
  AlertTriangle,
  Bike,
  CheckCircle2,
  Lightbulb,
  Receipt,
  Wallet,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/Sensitive";
import { useSensitiveRevealed } from "@/lib/sensitive";
import type { Board, BoardPeriod } from "./board";
import {
  METRIC_BY_ID,
  METRIC_GROUP_LABEL,
  METRIC_GROUP_UI,
  type MetricGroup,
  type MetricValue,
} from "./metrics";
import { planState, STATUS_UI, type PlanState } from "./status";
import { buildAdvice, type Advice } from "./advice";

/**
 * «Обзор» (07.09, задание заказчика: три раздела аналитики).
 *
 * Это экран ДЛЯ ЧЕЛОВЕКА, который зашёл разобраться, как идёт бизнес:
 * не плитки-повтор стены, а четыре направления — Аренда, Продажи,
 * Ремонты, Выкуп — каждое своим блоком со всеми его показателями, планом
 * и вердиктом. Справа — «Что делать»: советы, посчитанные из цифр.
 *
 * Экран помещается в монитор целиком: блоки делят высоту, кегли внутри
 * считаются от блока (единицы контейнера). На телефоне — в столбик.
 * Единицы контейнера нельзя использовать на самом контейнере, поэтому у
 * каждого блока отступы живут на внутренней обёртке.
 */

const GROUPS: MetricGroup[] = ["rent", "sales", "service", "buyout"];
const ICON = { bike: Bike, wallet: Wallet, wrench: Wrench, receipt: Receipt } as const;

/** Главный показатель направления — он идёт крупно, остальные строками. */
const LEAD: Record<MetricGroup, string> = {
  rent: "rent.park_load",
  sales: "sales.revenue",
  service: "service.revenue",
  buyout: "buyout.active",
  plan: "plan.summary",
};

export function Overview({
  board,
  values,
  periodOf,
  compact = false,
}: {
  board: Board;
  values: Record<string, MetricValue>;
  periodOf: (metricId: string) => BoardPeriod;
  compact?: boolean;
}) {
  const revealed = useSensitiveRevealed();
  const advice = buildAdvice(values, board, periodOf);
  const planOf = (metricId: string) =>
    board.tiles.find((t) => t.metric === metricId)?.plan ?? null;

  return (
    <div
      className={cn(
        "min-h-0 flex-1 gap-3",
        compact ? "flex flex-col" : "grid grid-cols-[1fr_1fr_0.85fr] grid-rows-2",
      )}
    >
      {/* Советы — правая колонка на всю высоту; направления заполняют 2×2
          слева. На телефоне советы идут после направлений. */}
      {!compact && <AdvicePanel items={advice} compact={compact} />}
      {GROUPS.map((g) => (
        <GroupPanel
          key={g}
          group={g}
          values={values}
          planOf={planOf}
          periodOf={periodOf}
          revealed={revealed}
          compact={compact}
        />
      ))}
      {compact && <AdvicePanel items={advice} compact={compact} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Panel({
  compact,
  className,
  children,
  dark,
}: {
  compact: boolean;
  className?: string;
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <section
      style={{
        containerType: compact ? "inline-size" : "size",
        borderRadius: 22,
      }}
      className={cn(
        "relative min-h-0 min-w-0 overflow-hidden",
        dark ? "bg-ink text-white" : "bg-surface ring-1 ring-inset ring-black/[0.05]",
        className,
      )}
    >
      {dark && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, #808080 0px 1px, transparent 1px 10px)",
            WebkitMaskImage:
              "radial-gradient(ellipse 80% 50% at 100% 0%, #000 70%, transparent 110%)",
            maskImage:
              "radial-gradient(ellipse 80% 50% at 100% 0%, #000 70%, transparent 110%)",
          }}
        />
      )}
      <div
        style={{ padding: compact ? 16 : "clamp(12px, 4cqmin, 34px)" }}
        className={cn("flex min-h-0 min-w-0 flex-col", !compact && "absolute inset-0")}
      >
        {children}
      </div>
    </section>
  );
}

function GroupPanel({
  group,
  values,
  planOf,
  periodOf,
  revealed,
  compact,
}: {
  group: MetricGroup;
  values: Record<string, MetricValue>;
  planOf: (id: string) => number | null;
  periodOf: (id: string) => BoardPeriod;
  revealed: boolean;
  compact: boolean;
}) {
  const ui = METRIC_GROUP_UI[group];
  const Icon = ICON[ui.icon as keyof typeof ICON] ?? Bike;
  const defs = [...METRIC_BY_ID.values()].filter(
    (d) => d.group === group && !d.comingSoon && values[d.id],
  );
  const lead = defs.find((d) => d.id === LEAD[group]) ?? defs[0];
  const rest = defs.filter((d) => d !== lead);

  // Вердикт направления — по худшему из его планов.
  const states = defs
    .map((d) => {
      const plan = planOf(d.id);
      const v = values[d.id];
      if (!plan || !v) return null;
      return planState(v.value, plan, !!d.periodic, periodOf(d.id));
    })
    .filter(Boolean) as PlanState[];
  const rank = { behind: 0, risk: 1, ontrack: 2, ahead: 3 } as const;
  const worst = states.sort((a, b) => rank[a.status] - rank[b.status])[0] ?? null;
  const verdictUi = worst ? STATUS_UI[worst.status] : null;

  const leadValue = lead ? values[lead.id] : undefined;
  const leadPlan = lead ? planOf(lead.id) : null;
  const leadState =
    lead && leadValue && leadPlan
      ? planState(leadValue.value, leadPlan, !!lead.periodic, periodOf(lead.id))
      : null;
  const leadHidden = !!lead?.sensitive && !revealed;

  return (
    <Panel compact={compact}>
      {/* Заголовок направления + вердикт */}
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div
          style={{ fontSize: compact ? "18px" : "max(13px, min(8cqh, 5.5cqw, 24px))" }}
          className="flex min-w-0 items-center gap-[0.5em] font-bold text-ink"
        >
          <span
            className={cn(
              "flex h-[1.5em] w-[1.5em] shrink-0 items-center justify-center rounded-[0.4em]",
              ui.chip,
            )}
          >
            <Icon className="h-[0.95em] w-[0.95em]" />
          </span>
          <span className="truncate">{METRIC_GROUP_LABEL[group]}</span>
        </div>
        {worst && verdictUi && (
          <span
            style={{ fontSize: compact ? "12px" : "max(10px, min(6cqh, 4cqw, 18px))" }}
            className={cn(
              "shrink-0 rounded-full px-[0.9em] py-[0.35em] font-bold",
              verdictUi.chip,
            )}
          >
            {worst.label}
          </span>
        )}
      </div>

      {/* Главная цифра направления */}
      {lead && leadValue && (
        <div
          className="flex shrink-0 items-end justify-between gap-3"
          style={{ marginTop: compact ? 10 : "2.5cqh" }}
        >
          <div className="min-w-0">
            <div
              style={{ fontSize: compact ? "12px" : "max(10px, min(6.5cqh, 4.2cqw, 20px))" }}
              className="truncate text-muted"
            >
              {lead.title}
            </div>
            <div
              style={{ fontSize: compact ? "38px" : "max(22px, min(20cqh, 12cqw, 64px))" }}
              className={cn(
                "truncate font-display font-extrabold leading-[0.95] tracking-[-0.03em] tabular-nums",
                leadValue.tone === "bad" ? "text-red-ink" : "text-ink",
              )}
            >
              {leadHidden ? <Sensitive>{leadValue.display}</Sensitive> : leadValue.display}
            </div>
            <div
              style={{ fontSize: compact ? "12px" : "max(10px, min(6cqh, 4cqw, 19px))" }}
              className="truncate text-muted"
            >
              {leadValue.caption}
              {leadValue.extra ? ` · ${leadValue.extra}` : ""}
            </div>
          </div>
          {leadState && !leadHidden && (
            <div className="shrink-0 text-right">
              <div
                style={{ fontSize: compact ? "26px" : "max(16px, min(12cqh, 7cqw, 40px))" }}
                className={cn(
                  "font-display font-extrabold leading-none tabular-nums",
                  STATUS_UI[leadState.status].ink,
                )}
              >
                {leadState.pct}%
              </div>
              <div
                style={{ fontSize: compact ? "11px" : "max(9px, min(5.5cqh, 3.6cqw, 17px))" }}
                className="text-muted-2"
              >
                план {lead.format(leadPlan!)}
              </div>
            </div>
          )}
        </div>
      )}
      {leadState && !leadHidden && (
        <Bar
          state={leadState}
          style={{
            marginTop: compact ? 8 : "1.6cqh",
            height: compact ? 10 : "max(7px, min(4cqh, 18px))",
          }}
        />
      )}

      {/* Остальные показатели направления — строками */}
      <div
        className="flex min-h-0 flex-1 flex-col justify-evenly"
        style={{
          marginTop: compact ? 12 : "1cqh",
          fontSize: compact ? "14px" : rowSize(rest.length),
        }}
      >
        {rest.map((d) => {
          const v = values[d.id]!;
          const plan = planOf(d.id);
          const st = plan ? planState(v.value, plan, !!d.periodic, periodOf(d.id)) : null;
          const hidden = !!d.sensitive && !revealed;
          return (
            <div
              key={d.id}
              className="flex min-h-0 items-center gap-[0.7em] border-t border-black/[0.05] py-[0.3em]"
            >
              <span className="min-w-0 flex-1 truncate font-semibold text-ink-2">{d.title}</span>
              <span
                className={cn(
                  "shrink-0 font-display font-extrabold tabular-nums",
                  v.tone === "bad" ? "text-red-ink" : "text-ink",
                )}
                style={{ fontSize: "1.2em" }}
              >
                {hidden ? <Sensitive>{v.display}</Sensitive> : v.display}
              </span>
              {st ? (
                <>
                  <span
                    className="relative hidden shrink-0 overflow-hidden rounded-full bg-ink/[0.08] sm:block"
                    style={{ height: "0.55em", width: "20%" }}
                  >
                    <span
                      className={cn("block h-full rounded-full", STATUS_UI[st.status].bar)}
                      style={{ width: hidden ? 0 : `${Math.min(100, st.pct)}%` }}
                    />
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-right font-extrabold tabular-nums",
                      STATUS_UI[st.status].ink,
                    )}
                    style={{ width: "3.2em" }}
                  >
                    {hidden ? "•••" : `${st.pct}%`}
                  </span>
                </>
              ) : (
                <span
                  className="hidden shrink-0 truncate text-right text-muted sm:inline"
                  style={{ fontSize: "0.82em", maxWidth: "34%" }}
                >
                  {v.caption}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function rowSize(n: number): string {
  // Строки делят нижнюю половину блока; чем больше строк, тем мельче.
  const share = (42 / Math.max(2, n)).toFixed(1);
  return `max(11px, min(${share}cqh, 3.8cqw, 18px))`;
}

function Bar({ state, style }: { state: PlanState; style?: React.CSSProperties }) {
  const ui = STATUS_UI[state.status];
  return (
    <div className="relative w-full shrink-0 overflow-hidden rounded-full bg-ink/[0.08]" style={style}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-700", ui.bar)}
        style={{ width: `${Math.min(100, state.pct)}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AdvicePanel({ items, compact }: { items: Advice[]; compact: boolean }) {
  // На экране помещается не всё: сначала «горит», потом остальное.
  const shown = compact ? items : items.slice(0, 5);
  return (
    <Panel compact={compact} dark className={cn(!compact && "col-start-3 row-start-1 row-span-2")}>
      <div
        style={{ fontSize: compact ? "18px" : "max(13px, min(4.2cqh, 7cqw, 24px))" }}
        className="relative flex shrink-0 items-center gap-[0.5em] font-bold"
      >
        <span className="flex h-[1.5em] w-[1.5em] shrink-0 items-center justify-center rounded-[0.4em] bg-white/10 text-amber-300">
          <Lightbulb className="h-[0.95em] w-[0.95em]" />
        </span>
        Что делать
      </div>

      <div
        className="relative flex min-h-0 flex-1 flex-col gap-[1.2cqh] overflow-hidden"
        style={{
          marginTop: compact ? 12 : "2cqh",
          fontSize: compact ? "14px" : adviceSize(shown.length),
        }}
      >
        {shown.map((a, i) => {
          const Icon = a.tone === "good" ? CheckCircle2 : AlertTriangle;
          return (
            <div
              key={i}
              className="flex min-h-0 shrink gap-[0.7em] overflow-hidden rounded-[0.9em] bg-white/[0.06] p-[0.85em]"
            >
              <Icon
                className={cn(
                  "mt-[0.1em] h-[1.15em] w-[1.15em] shrink-0",
                  a.tone === "bad"
                    ? "text-red-400"
                    : a.tone === "warn"
                      ? "text-amber-300"
                      : "text-emerald-300",
                )}
              />
              <div className="min-w-0">
                <div className={cn("font-bold leading-snug", !compact && "line-clamp-2")}>{a.title}</div>
                <div
                  className={cn("mt-[0.2em] leading-snug text-white/60", !compact && "a-hide-xs line-clamp-3")}
                  style={{ fontSize: "0.86em" }}
                >
                  {a.text}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function adviceSize(n: number): string {
  // На каждый совет — своя доля высоты; заголовок + две строки текста.
  const share = (15 / Math.max(2, n)).toFixed(1);
  return `max(11px, min(${share}cqh, 4.4cqw, 17px))`;
}
