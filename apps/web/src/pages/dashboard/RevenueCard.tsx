import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Card, DeltaPill } from "./KpiCard";
import {
  formatRub,
  type DashboardMetrics,
} from "./useDashboardMetrics";

type Period = "day" | "week" | "month";

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

  const { total, chart, labels } = useMemo(() => {
    const byDay = metrics.revenueByDay;
    const today = new Date();

    if (period === "month") {
      const daysInMonth = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        0,
      ).getDate();
      const arr: number[] = Array(daysInMonth).fill(0);
      const lbls: string[] = [];
      for (let i = 0; i < daysInMonth; i++) {
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
        const found = byDay.find((x) => x.date === dateStr);
        arr[i] = found?.sum ?? 0;
        lbls.push(String(i + 1));
      }
      return { total: metrics.revenueMonth, chart: arr, labels: lbls };
    }

    if (period === "week") {
      const arr: number[] = Array(7).fill(0);
      const lbls: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const found = byDay.find((x) => x.date === dateStr);
        arr[6 - i] = found?.sum ?? 0;
        lbls.push(d.toLocaleDateString("ru-RU", { weekday: "short" }));
      }
      return { total: arr.reduce((s, v) => s + v, 0), chart: arr, labels: lbls };
    }

    // day — тот же период, но показываем час… тут упрощение: показываем последние 12 часов с нулями
    const arr: number[] = Array(12).fill(0);
    const lbls: string[] = [];
    for (let i = 11; i >= 0; i--) {
      lbls.push(`${23 - i}:00`);
    }
    return { total: metrics.todayIncoming, chart: arr, labels: lbls };
  }, [period, metrics]);

  const up = true;
  const max = Math.max(...chart, 1);
  const isEmpty = total === 0;

  return (
    <Card blue className={className}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-medium text-white/80">Выручка</div>
          <div className="mt-2 font-display text-[28px] font-extrabold tabular-nums">
            {isEmpty ? "0" : formatRub(total)}
            <span className="ml-1 text-[18px] font-bold text-white/70">₽</span>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-white/80">
            {!isEmpty && period === "month" && metrics.revenueMonthCount > 0 && (
              <DeltaPill
                blue
                tone={up ? "up" : "down"}
                label={`${metrics.revenueMonthCount} ${plural(metrics.revenueMonthCount, ["платёж", "платежа", "платежей"])}`}
              />
            )}
            {isEmpty && (
              <span className="text-white/70">
                {period === "day"
                  ? "сегодня платежей не было"
                  : period === "week"
                    ? "за неделю нет поступлений"
                    : "в этом месяце платежей не было"}
              </span>
            )}
          </div>
        </div>
        <div className="inline-flex rounded-full bg-white/15 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPeriod(t.id)}
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
      </div>
      <div className="mt-4 flex h-20 items-end gap-1">
        {chart.map((v, i) => {
          const isLast = i === chart.length - 1;
          return (
            <div key={i} className="relative flex-1">
              <div
                className={cn(
                  "w-full rounded-t",
                  isLast ? "bg-white" : "bg-white/40",
                )}
                style={{ height: `${Math.max((v / max) * 80, isEmpty ? 0 : 1)}px` }}
              />
              {labels[i] && i % Math.ceil(chart.length / 8) === 0 && (
                <span className="absolute left-1/2 top-full -translate-x-1/2 pt-1 text-[9px] font-medium text-white/60">
                  {labels[i]}
                </span>
              )}
            </div>
          );
        })}
      </div>
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
