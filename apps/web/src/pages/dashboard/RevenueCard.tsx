import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Card, DeltaPill } from "./KpiCard";
import {
  formatRub,
  type DashboardMetrics,
} from "./useDashboardMetrics";
import { RevenueRentalsList, type RevenuePeriod, periodWindow } from "./RevenueRentalsList";
import { ExpandRevenueButton, RevenueListModal } from "./RevenueListModal";
import { useApiPayments } from "@/lib/api/payments";
import { workingHoursList } from "@/lib/workingHours";

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

  const { data: payments = [] } = useApiPayments();

  const { total, chart, paymentsCount } = useMemo(() => {
    const today = new Date();
    const win = periodWindow(period);

    // Все платежи в окне периода (paid, не залог/возврат). Та же
    // формула что в списке аренд внизу — суммы совпадут.
    const inWindow = payments.filter((p) => {
      if (!p.paid) return false;
      if (p.type === "deposit" || p.type === "refund") return false;
      if (!p.paidAt) return false;
      const t = new Date(p.paidAt).getTime();
      return t >= win.start.getTime() && t < win.end.getTime();
    });
    const totalSum = inWindow.reduce((s, p) => s + p.amount, 0);

    // Группировка по дням (YYYY-MM-DD) для столбцов графика.
    const byDay = new Map<string, { sum: number; count: number }>();
    for (const p of inWindow) {
      const d = (p.paidAt ?? "").slice(0, 10);
      if (!d) continue;
      const cur = byDay.get(d) ?? { sum: 0, count: 0 };
      cur.sum += p.amount;
      cur.count += 1;
      byDay.set(d, cur);
    }

    // Строим столбцы по выбранному периоду.
    type Bar = { date: string; label: string; sum: number; count: number };
    const bars: Bar[] = [];

    if (period === "day") {
      // v0.4.21: почасовая шкала от open до close (settings.work_hours_*).
      // Платежи группируются по часу совершения. Раньше был один большой
      // столбик за сегодня — мало info.
      const hours = workingHoursList(); // [9, 10, ..., 21]
      const byHour = new Map<number, { sum: number; count: number }>();
      for (const p of inWindow) {
        if (!p.paidAt) continue;
        const t = new Date(p.paidAt);
        const h = t.getHours();
        const cur = byHour.get(h) ?? { sum: 0, count: 0 };
        cur.sum += p.amount;
        cur.count += 1;
        byHour.set(h, cur);
      }
      // Платежи вне окна работы — собираем в крайние часы (open / close).
      // Это редкий кейс (24/7 аккаунт, оплата ночью), но не теряем сумму.
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
      // 7 дней начиная с понедельника текущей недели.
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
      // v0.4.13: month-график строим по РАСЧЁТНОМУ периоду 15→14
      // (а не календарному 1-31). Так шкала графика и список аренд
      // ниже соответствуют тому же окну, что в KPI «Выручка» в Аренды.
      const dayMs = 86_400_000;
      for (
        let t = win.start.getTime();
        t < win.end.getTime();
        t += dayMs
      ) {
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

    return {
      total: totalSum,
      chart: bars,
      paymentsCount: inWindow.length,
    };
  }, [period, payments]);

  // Если выбран день — сумма для верхнего числа считается по этому дню,
  // иначе по всему периоду.
  const selectedBar = selectedDay
    ? chart.find((b) => b.date === selectedDay) ?? null
    : null;
  const displayTotal = selectedBar ? selectedBar.sum : total;
  const displayCount = selectedBar ? selectedBar.count : paymentsCount;

  const max = Math.max(...chart.map((b) => b.sum), 1);
  const isEmpty = displayTotal === 0;

  return (
    <Card blue className={className}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-medium text-white/80">
            Выручка
            {selectedBar && (
              <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                за {formatBarDate(selectedBar.date)} ·{" "}
                <button
                  type="button"
                  onClick={() => setSelectedDay(null)}
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
                  {selectedBar
                    ? "в этот день платежей не было"
                    : period === "day"
                      ? "сегодня платежей не было"
                      : period === "week"
                        ? "за неделю нет поступлений"
                        : "в этом месяце платежей не было"}
                </span>
              )}
            </div>
            {!selectedBar &&
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
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  period === t.id
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

      {/* График — каждый столбик кликабельный. При наведении — tooltip
          с датой / суммой / кол-вом платежей. По клику — фильтрует список
          аренд снизу по выбранному дню (повторный клик снимает фильтр). */}
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
              onClick={() =>
                setSelectedDay(isSelected ? null : b.date)
              }
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
              {/* Лейбл под столбиком */}
              {showLabel && (
                <span className="absolute left-1/2 top-full -translate-x-1/2 pt-1 text-[9px] font-medium text-white/60">
                  {b.label}
                </span>
              )}
              {/* Tooltip — простой div поверх. Появляется только при hover. */}
              {b.sum > 0 && (
                <div className="pointer-events-none absolute -top-2 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[8px] bg-ink px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-lg group-hover:block">
                  <div className="text-white/70">
                    {formatBarDate(b.date)}
                  </div>
                  <div className="font-bold tabular-nums">
                    {formatRub(b.sum)} ₽
                  </div>
                  <div className="text-[10px] text-white/70">
                    {b.count} {plural(b.count, ["платёж", "платежа", "платежей"])}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Список аренд за выбранный период — внутри той же Card, но на белой
          плашке. Если выбран день в графике — список фильтруется по нему. */}
      <div className="mt-4 -mx-4 -mb-4 rounded-b-[16px] bg-white px-4 pb-4 pt-3">
        <div className="mb-2 flex items-center justify-between text-[12px] font-semibold uppercase tracking-wider text-muted-2">
          <span>
            Аренды за{" "}
            {selectedBar
              ? formatBarDate(selectedBar.date)
              : period === "day"
                ? "сегодня"
                : period === "week"
                  ? "неделю"
                  : "месяц"}
          </span>
          {selectedBar && (
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:bg-blue-100"
            >
              сбросить фильтр
            </button>
          )}
        </div>
        <div className="max-h-[280px] overflow-y-auto">
          <RevenueRentalsList period={period} dayFilter={selectedDay} />
        </div>
      </div>

      {fullscreen && (
        <RevenueListModal
          initialPeriod={period}
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
