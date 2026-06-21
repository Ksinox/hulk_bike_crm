import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Card, DeltaPill } from "./KpiCard";
import { formatRub, type DashboardMetrics } from "./useDashboardMetrics";
import {
  RevenueRentalsList,
  type RevenuePeriod,
  type MethodFilter,
  periodWindow,
} from "./RevenueRentalsList";
import { ExpandRevenueButton, RevenueListModal } from "./RevenueListModal";
import { useApiPayments } from "@/lib/api/payments";
import { workingHoursList } from "@/lib/workingHours";
import { DateRangePicker } from "@/components/ui/date-picker";

type Period = RevenuePeriod;

const TABS: { id: Period; label: string }[] = [
  { id: "day", label: "День" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
];

export function RevenueCard({
  className,
  metrics,
}: {
  className?: string;
  metrics: DashboardMetrics;
}) {
  const [period, setPeriod] = useState<Period>("month");
  const [fullscreen, setFullscreen] = useState(false);
  /** Выбранный день фильтра (YYYY-MM-DD) или null = весь период. */
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  /** Произвольный диапазон (фирменный календарь) — приоритетнее табов. */
  const [customRange, setCustomRange] = useState<{
    from: string;
    to: string;
  } | null>(null);
  /** Фильтр по способу: всё / только наличные / только безнал. */
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");

  const { data: payments = [] } = useApiPayments();

  // Эффективное окно: произвольный диапазон приоритетнее периода.
  const win = useMemo(() => {
    if (customRange) {
      return {
        start: new Date(customRange.from + "T00:00:00"),
        end: new Date(
          new Date(customRange.to + "T00:00:00").getTime() + 86_400_000,
        ),
      };
    }
    return periodWindow(period);
  }, [period, customRange]);

  const { total, chart, paymentsCount } = useMemo(() => {
    const today = new Date();

    // Платежи-выручка в окне: paid, не залог/возврат, не из депозита
    // (method=deposit — внутренний, нал+безнал = total).
    const inWindow = payments.filter((p) => {
      if (!p.paid || !p.paidAt) return false;
      if (p.type === "deposit" || p.type === "refund") return false;
      // deposit_forfeit (удержанный в ущерб залог) — доход, остальные
      // method='deposit' — внутренние, в выручку не идут.
      if (p.method === "deposit" && p.type !== "deposit_forfeit") return false;
      const t = new Date(p.paidAt).getTime();
      return t >= win.start.getTime() && t < win.end.getTime();
    });
    const totalSum = inWindow.reduce((s, p) => s + p.amount, 0);

    // На произвольном диапазоне график не строим (может быть длинным) —
    // показываем сумму + разбивку + список за период.
    if (customRange) {
      return { total: totalSum, chart: [], paymentsCount: inWindow.length };
    }

    const byDay = new Map<string, { sum: number; count: number }>();
    for (const p of inWindow) {
      const d = (p.paidAt ?? "").slice(0, 10);
      if (!d) continue;
      const cur = byDay.get(d) ?? { sum: 0, count: 0 };
      cur.sum += p.amount;
      cur.count += 1;
      byDay.set(d, cur);
    }

    type Bar = { date: string; label: string; sum: number; count: number };
    const bars: Bar[] = [];

    if (period === "day") {
      const hours = workingHoursList();
      const byHour = new Map<number, { sum: number; count: number }>();
      for (const p of inWindow) {
        if (!p.paidAt) continue;
        const h = new Date(p.paidAt).getHours();
        const cur = byHour.get(h) ?? { sum: 0, count: 0 };
        cur.sum += p.amount;
        cur.count += 1;
        byHour.set(h, cur);
      }
      for (const [h, v] of byHour.entries()) {
        if (h < hours[0]!) {
          const cur = byHour.get(hours[0]!) ?? { sum: 0, count: 0 };
          cur.sum += v.sum;
          cur.count += v.count;
          byHour.set(hours[0]!, cur);
          byHour.delete(h);
        } else if (h >= hours[hours.length - 1]! + 1) {
          const last = hours[hours.length - 1]!;
          const cur = byHour.get(last) ?? { sum: 0, count: 0 };
          cur.sum += v.sum;
          cur.count += v.count;
          byHour.set(last, cur);
          byHour.delete(h);
        }
      }
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      for (const h of hours) {
        const v = byHour.get(h) ?? { sum: 0, count: 0 };
        bars.push({
          date: `${todayStr}T${String(h).padStart(2, "0")}`,
          label: `${h}`,
          sum: v.sum,
          count: v.count,
        });
      }
    } else if (period === "week") {
      for (let i = 0; i < 7; i++) {
        const d = new Date(win.start.getTime() + i * 86_400_000);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const v = byDay.get(ds) ?? { sum: 0, count: 0 };
        bars.push({
          date: ds,
          label: d.toLocaleDateString("ru-RU", { weekday: "short" }),
          sum: v.sum,
          count: v.count,
        });
      }
    } else {
      const dayMs = 86_400_000;
      for (let t = win.start.getTime(); t < win.end.getTime(); t += dayMs) {
        const d = new Date(t);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const v = byDay.get(ds) ?? { sum: 0, count: 0 };
        bars.push({
          date: ds,
          label: String(d.getDate()),
          sum: v.sum,
          count: v.count,
        });
      }
    }

    return { total: totalSum, chart: bars, paymentsCount: inWindow.length };
  }, [period, payments, win, customRange]);

  // Разбивка нал/безнал за окно (учитывает выбранный день). Всегда показывает
  // оба значения — независимо от фильтра (фильтр сужает только список).
  const breakdown = useMemo(() => {
    let cash = 0;
    let cashless = 0;
    for (const p of payments) {
      if (!p.paid || !p.paidAt) continue;
      if (p.type === "deposit" || p.type === "refund") continue;
      if (p.method === "deposit" && p.type !== "deposit_forfeit") continue;
      const t = new Date(p.paidAt).getTime();
      if (t < win.start.getTime() || t >= win.end.getTime()) continue;
      if (!customRange && selectedDay && p.paidAt.slice(0, 10) !== selectedDay)
        continue;
      if (p.method === "cash") cash += p.amount;
      else cashless += p.amount;
    }
    return { cash, cashless };
  }, [payments, win, selectedDay, customRange]);
  const breakdownTotal = breakdown.cash + breakdown.cashless;
  const cashPct =
    breakdownTotal > 0 ? (breakdown.cash / breakdownTotal) * 100 : 0;

  const selectedBar =
    !customRange && selectedDay
      ? chart.find((b) => b.date === selectedDay) ?? null
      : null;
  const displayTotal = selectedBar ? selectedBar.sum : total;
  const displayCount = selectedBar ? selectedBar.count : paymentsCount;

  const max = Math.max(...chart.map((b) => b.sum), 1);
  const isEmpty = displayTotal === 0;

  // Подпись текущего среза для шапки списка.
  const rangeLabel = customRange
    ? customRange.from === customRange.to
      ? formatBarDate(customRange.from)
      : `${formatBarDate(customRange.from)} — ${formatBarDate(customRange.to)}`
    : selectedBar
      ? formatBarDate(selectedBar.date)
      : period === "day"
        ? "сегодня"
        : period === "week"
          ? "неделю"
          : "месяц";

  return (
    <Card blue className={className}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-medium text-white/80">
            Выручка
            {(selectedBar || customRange) && (
              <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                {customRange ? "период" : `за ${formatBarDate(selectedBar!.date)}`}
                {" · "}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDay(null);
                    setCustomRange(null);
                  }}
                  className="underline underline-offset-2 hover:text-white"
                >
                  сбросить
                </button>
              </span>
            )}
          </div>
          <div className="mt-2 font-display text-[28px] font-extrabold tabular-nums">
            {isEmpty ? "0" : formatRub(displayTotal)}
            <span className="ml-1 text-[18px] font-bold text-white/70">₽</span>
          </div>
          <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-white/80">
            <div className="flex items-center gap-1.5">
              {!isEmpty && displayCount > 0 && (
                <DeltaPill
                  blue
                  tone="up"
                  label={`${displayCount} ${plural(displayCount, ["платёж", "платежа", "платежей"])}`}
                />
              )}
              {isEmpty && (
                <span className="text-white/70">
                  за выбранный период платежей не было
                </span>
              )}
            </div>
            {!selectedBar &&
              !customRange &&
              period === "month" &&
              metrics.revenueExpected > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-white/80">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 font-bold">
                    +{formatRub(metrics.revenueExpected)} ₽ ожидается
                  </span>
                  <span className="text-white/60">
                    {metrics.revenueExpectedCount}{" "}
                    {plural(metrics.revenueExpectedCount, [
                      "аренда без подтв. оплаты",
                      "аренды без подтв. оплаты",
                      "аренд без подтв. оплаты",
                    ])}
                  </span>
                </div>
              )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full bg-white/15 p-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setPeriod(t.id);
                  setSelectedDay(null);
                  setCustomRange(null);
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  !customRange && period === t.id
                    ? "bg-white text-blue-700"
                    : "bg-transparent text-white/75 hover:text-white",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <ExpandRevenueButton onClick={() => setFullscreen(true)} />
        </div>
      </div>

      {/* Деление нал/безнал — кликабельно: фильтрует список ниже (для сверки
          бухгалтерии «сколько наличкой / сколько переводами»). */}
      {breakdownTotal > 0 && (
        <div className="mt-3.5">
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/20">
            <div
              className="bg-white transition-all"
              style={{ width: `${cashPct}%` }}
            />
            <div
              className="bg-white/40 transition-all"
              style={{ width: `${100 - cashPct}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
            <button
              type="button"
              onClick={() =>
                setMethodFilter(methodFilter === "cash" ? "all" : "cash")
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 transition-all",
                methodFilter === "cash"
                  ? "bg-white/25 text-white"
                  : methodFilter === "cashless"
                    ? "text-white/40"
                    : "text-white/90 hover:bg-white/10",
              )}
            >
              <span className="h-2 w-2 rounded-full bg-white" />
              Наличные{" "}
              <b className="tabular-nums">{formatRub(breakdown.cash)} ₽</b>
            </button>
            <button
              type="button"
              onClick={() =>
                setMethodFilter(methodFilter === "cashless" ? "all" : "cashless")
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 transition-all",
                methodFilter === "cashless"
                  ? "bg-white/25 text-white"
                  : methodFilter === "cash"
                    ? "text-white/40"
                    : "text-white/80 hover:bg-white/10",
              )}
            >
              <span className="h-2 w-2 rounded-full bg-white/45" />
              Безнал{" "}
              <b className="tabular-nums">{formatRub(breakdown.cashless)} ₽</b>
            </button>
          </div>
        </div>
      )}

      {/* График — только для периодов (день/неделя/месяц), не для произвольного
          диапазона. Каждый столбик кликабельный → фильтр по дню. */}
      {!customRange && chart.length > 0 && (
        <div className="mt-4 flex h-20 items-end gap-1">
          {chart.map((b) => {
            const isSelected = b.date === selectedDay;
            const heightPx = Math.max((b.sum / max) * 80, b.sum > 0 ? 2 : 1);
            const showLabel =
              chart.length <= 7 ||
              chart.indexOf(b) % Math.ceil(chart.length / 10) === 0;
            return (
              <button
                key={b.date}
                type="button"
                onClick={() => setSelectedDay(isSelected ? null : b.date)}
                title={tooltipText(b)}
                className="group relative flex flex-1 cursor-pointer flex-col-reverse items-stretch focus:outline-none"
              >
                <div
                  className={cn(
                    "w-full rounded-t transition-colors",
                    isSelected
                      ? "bg-white"
                      : b.sum > 0
                        ? "bg-white/55 group-hover:bg-white"
                        : "bg-white/20",
                  )}
                  style={{ height: `${heightPx}px` }}
                />
                {showLabel && (
                  <span className="absolute left-1/2 top-full -translate-x-1/2 pt-1 text-[9px] font-medium text-white/60">
                    {b.label}
                  </span>
                )}
                {b.sum > 0 && (
                  <div className="pointer-events-none absolute -top-2 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[8px] bg-ink px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-lg group-hover:block">
                    <div className="text-white/70">{formatBarDate(b.date)}</div>
                    <div className="font-bold tabular-nums">
                      {formatRub(b.sum)} ₽
                    </div>
                    <div className="text-[10px] text-white/70">
                      {b.count}{" "}
                      {plural(b.count, ["платёж", "платежа", "платежей"])}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Список платежей за выбранный срез — на белой плашке. */}
      <div className="mt-4 -mx-4 -mb-4 rounded-b-[16px] bg-white px-4 pb-4 pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-muted-2">
            Платежи за {rangeLabel}
          </span>
          {/* Произвольный период — фирменный календарь (день или диапазон). */}
          <DateRangePicker
            from={customRange?.from ?? null}
            to={customRange?.to ?? null}
            placeholder="Период"
            className="w-[180px]"
            onChange={({ from, to }) => {
              if (from && to) {
                setCustomRange({ from, to });
                setSelectedDay(null);
              } else {
                setCustomRange(null);
              }
            }}
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto scrollbar-thin">
          <RevenueRentalsList
            period={period}
            dayFilter={customRange ? null : selectedDay}
            range={customRange}
            methodFilter={methodFilter}
          />
        </div>
      </div>

      {fullscreen && (
        <RevenueListModal
          initialPeriod={period}
          initialRange={customRange}
          initialMethodFilter={methodFilter}
          onClose={() => setFullscreen(false)}
        />
      )}
    </Card>
  );
}

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** Форматирует «2026-04-28» → «28 апр, вт». */
function formatBarDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    weekday: "short",
  });
}

function tooltipText(b: { date: string; sum: number; count: number }): string {
  return `${formatBarDate(b.date)}: ${b.sum.toLocaleString("ru-RU")} ₽ · ${b.count} платежей`;
}
