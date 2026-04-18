import { useState } from "react";
import { cn } from "@/lib/utils";
import { mockRevenue, type RevenuePeriod } from "@/lib/mock/dashboard";
import { Card, DeltaPill } from "./KpiCard";

const TABS: { id: RevenuePeriod; label: string }[] = [
  { id: "day", label: "День" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
];

export function RevenueCard({ className }: { className?: string }) {
  const [period, setPeriod] = useState<RevenuePeriod>("day");
  const r = mockRevenue[period];
  const up = r.delta >= 0;
  const max = Math.max(...r.chart);

  return (
    <Card blue className={className}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-medium text-white/80">Выручка</div>
          <div className="mt-2 font-display text-[28px] font-extrabold tabular-nums">
            {r.value}
            <span className="ml-1 text-[18px] font-bold text-white/70">
              {r.unit}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-white/80">
            <DeltaPill
              blue
              tone={up ? "up" : "down"}
              label={`${up ? "+" : ""}${r.delta}%`}
            />
            <span>{r.vs}</span>
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
        {r.chart.map((v, i) => {
          const isToday = i === r.chart.length - 1;
          return (
            <div key={i} className="relative flex-1">
              <div
                className={cn(
                  "w-full rounded-t",
                  isToday ? "bg-white" : "bg-white/40",
                )}
                style={{ height: `${(v / max) * 80}px` }}
              />
              <span className="absolute left-1/2 top-full -translate-x-1/2 pt-1 text-[9px] font-medium text-white/60">
                {r.labels[i]}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
