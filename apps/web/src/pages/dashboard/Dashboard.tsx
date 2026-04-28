import { useState } from "react";
import { Topbar } from "./Topbar";
import { Greeting } from "./Greeting";
import { KpiCard } from "./KpiCard";
import { ParkPanel } from "./ParkPanel";
import { RevenueCard } from "./RevenueCard";
import { ReturnsList } from "./ReturnsList";
import { ReturnsTable } from "./ReturnsTable";
import { OverdueTable } from "./OverdueTable";
import { ActivityFeed } from "./ActivityFeed";
import { ClassicKpi, CLASSIC_KPI_ICONS } from "./ClassicKpi";
import { NewApplicationsWidget } from "./NewApplicationsWidget";
import { loadView, saveView, type DashboardView } from "./view";
import {
  formatRub,
  useDashboardMetrics,
  type DashboardMetrics,
} from "./useDashboardMetrics";

export function Dashboard() {
  const [view, setView] = useState<DashboardView>(() => loadView());
  const metrics = useDashboardMetrics();

  const onViewChange = (v: DashboardView) => {
    setView(v);
    saveView(v);
  };

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />
      <Greeting view={view} onViewChange={onViewChange} metrics={metrics} />
      {view === "park" ? (
        <ParkVariant metrics={metrics} />
      ) : (
        <ClassicVariant metrics={metrics} />
      )}
    </main>
  );
}

function ParkVariant({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <div className="grid auto-rows-[minmax(120px,auto)] grid-cols-12 gap-4">
      <div className="col-span-3">
        <KpiCard
          blue
          title="Поступит сегодня"
          value={metrics.todayIncoming > 0 ? `+${formatRub(metrics.todayIncoming)}` : "0"}
          unit="₽"
          delta={
            metrics.todayIncomingDelta != null
              ? {
                  tone: metrics.todayIncomingDelta >= 0 ? "up" : "down",
                  label: `${metrics.todayIncomingDelta >= 0 ? "+" : ""}${metrics.todayIncomingDelta}%`,
                }
              : undefined
          }
          foot={
            <span>
              {metrics.todayIncomingCount > 0
                ? `${metrics.todayIncomingCount} ${plural(metrics.todayIncomingCount, ["платёж", "платежа", "платежей"])}`
                : "платежей на сегодня нет"}
            </span>
          }
        />
      </div>
      <div className="col-span-3">
        <KpiCard
          title="Просрочено"
          value={String(metrics.overdueCount)}
          valueTone={metrics.overdueCount > 0 ? "red" : undefined}
          delta={
            metrics.overdueDeltaFromYesterday > 0
              ? {
                  tone: "down",
                  label: `+${metrics.overdueDeltaFromYesterday}`,
                }
              : undefined
          }
          foot={
            <span>
              {metrics.overdueCount > 0
                ? `долг ${formatRub(metrics.overdueSum)} ₽`
                : "нет просрочек"}
            </span>
          }
        />
      </div>
      <div className="col-span-3">
        <KpiCard
          title="Активных аренд"
          value={String(metrics.activeRentalsCount)}
          unit={metrics.fleetTotal > 0 ? `/ ${metrics.fleetTotal}` : undefined}
          foot={
            <span>
              {metrics.fleetTotal > 0
                ? `${metrics.loadPercent}% загрузка парка`
                : "парк пока пустой"}
            </span>
          }
        />
      </div>
      <div className="col-span-3">
        <NewApplicationsWidget />
      </div>

      {/* Главная двухколоночная зона — левая и правая колонки независимы
          по высоте. Если RevenueCard справа разворачивается со списком
          аренд — ParkPanel слева остаётся той же высоты, не растягивается.
          items-start гарантирует что флексы не растягиваются друг под друга. */}
      <div className="col-span-12 grid auto-rows-[minmax(120px,max-content)] grid-cols-12 items-start gap-4">
        <div className="col-span-8 flex flex-col gap-4">
          <ParkPanel metrics={metrics} />
          <OverdueTable items={metrics.overdue} />
          <ActivityFeed />
        </div>
        <div className="col-span-4 flex flex-col gap-4">
          <RevenueCard metrics={metrics} />
          <ReturnsList items={metrics.returnsToday} />
        </div>
      </div>
    </div>
  );
}

function ClassicVariant({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <div className="grid auto-rows-[minmax(120px,auto)] grid-cols-12 gap-4">
      <ClassicKpi
        className="col-span-3"
        title="Поступит сегодня"
        value={metrics.todayIncoming > 0 ? formatRub(metrics.todayIncoming) : "0"}
        unit="₽"
        icon={CLASSIC_KPI_ICONS.money}
        iconTone="green"
        delta={
          metrics.todayIncomingDelta != null
            ? {
                tone: metrics.todayIncomingDelta >= 0 ? "up" : "down",
                label: `${metrics.todayIncomingDelta >= 0 ? "+" : ""}${metrics.todayIncomingDelta}%`,
              }
            : undefined
        }
        foot={
          <span>
            {metrics.todayIncomingCount > 0
              ? `${metrics.todayIncomingCount} ${plural(metrics.todayIncomingCount, ["платёж", "платежа", "платежей"])}`
              : "нет платежей"}
          </span>
        }
      />
      <ClassicKpi
        className="col-span-3"
        title="Просрочено"
        value={String(metrics.overdueCount)}
        valueRed={metrics.overdueCount > 0}
        icon={CLASSIC_KPI_ICONS.alert}
        iconTone="red"
        delta={
          metrics.overdueDeltaFromYesterday > 0
            ? { tone: "down", label: `+${metrics.overdueDeltaFromYesterday}` }
            : undefined
        }
        foot={
          <span>
            {metrics.overdueCount > 0
              ? `долг ${formatRub(metrics.overdueSum)} ₽`
              : "нет просрочек"}
          </span>
        }
      />
      <ClassicKpi
        className="col-span-3"
        title="Активных аренд"
        value={String(metrics.activeRentalsCount)}
        unit={metrics.fleetTotal > 0 ? `/${metrics.fleetTotal}` : undefined}
        icon={CLASSIC_KPI_ICONS.rent}
        iconTone="blue"
        foot={
          <span>
            {metrics.fleetTotal > 0
              ? `${metrics.loadPercent}% загрузка`
              : "парк пустой"}
          </span>
        }
      />
      <NewApplicationsWidget className="col-span-3" />

      <ReturnsTable className="col-span-8" items={metrics.returnsToday} />
      <ActivityFeed className="col-span-4" compact />
      <OverdueTable
        className="col-span-12"
        items={metrics.overdue}
        showPhoneColumn
        compactHeader
      />
    </div>
  );
}

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
