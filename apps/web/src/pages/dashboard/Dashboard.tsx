import { useState } from "react";
import { Topbar } from "./Topbar";
import { Greeting } from "./Greeting";
import { KpiCard } from "./KpiCard";
import { ParkPanel } from "./ParkPanel";
import { RevenueCard } from "./RevenueCard";
import { ReturnsList } from "./ReturnsList";
import { ReturnsTable } from "./ReturnsTable";
import { OverdueTable } from "./OverdueTable";
import { TasksList } from "./TasksList";
import { ActivityFeed } from "./ActivityFeed";
import { ClassicKpi, CLASSIC_KPI_ICONS } from "./ClassicKpi";
import { loadView, saveView, type DashboardView } from "./view";

export function Dashboard() {
  const [view, setView] = useState<DashboardView>(() => loadView());

  const onViewChange = (v: DashboardView) => {
    setView(v);
    saveView(v);
  };

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />
      <Greeting view={view} onViewChange={onViewChange} />
      {view === "park" ? <ParkVariant /> : <ClassicVariant />}
    </main>
  );
}

function ParkVariant() {
  return (
    <div className="grid auto-rows-[minmax(120px,auto)] grid-cols-12 gap-4">
      <div className="col-span-3">
        <KpiCard
          blue
          title="Поступит сегодня"
          value="+14 600"
          unit="₽"
          delta={{ tone: "up", label: "+18%" }}
          foot={<span>к пн · 12 платежей</span>}
        />
      </div>
      <div className="col-span-3">
        <KpiCard
          title="Просрочено"
          value="3"
          valueTone="red"
          delta={{ tone: "down", label: "+1" }}
          foot={<span>со вчера · долг 7 400 ₽</span>}
        />
      </div>
      <div className="col-span-3">
        <KpiCard
          title="Активных аренд"
          value="38"
          unit="/ 54"
          foot={<span>70% загрузка парка</span>}
        />
      </div>
      <div className="col-span-3">
        <KpiCard
          title="Задач на сегодня"
          value="7"
          delta={{ tone: "down", label: "2 просрочены" }}
          foot={<span>5 новых</span>}
        />
      </div>

      <ParkPanel className="col-span-8 row-span-2" />
      <RevenueCard className="col-span-4" />
      <ReturnsList className="col-span-4" />

      <OverdueTable className="col-span-8" />
      <TasksList className="col-span-4" />
      <ActivityFeed className="col-span-8" />
    </div>
  );
}

function ClassicVariant() {
  return (
    <div className="grid auto-rows-[minmax(120px,auto)] grid-cols-12 gap-4">
      <ClassicKpi
        className="col-span-3"
        title="Поступит сегодня"
        value="14 600"
        unit="₽"
        icon={CLASSIC_KPI_ICONS.money}
        iconTone="green"
        delta={{ tone: "up", label: "+18%" }}
        foot={<span>к пн</span>}
      />
      <ClassicKpi
        className="col-span-3"
        title="Просрочено"
        value="3"
        valueRed
        icon={CLASSIC_KPI_ICONS.alert}
        iconTone="red"
        delta={{ tone: "down", label: "+1" }}
        foot={<span>со вчера</span>}
      />
      <ClassicKpi
        className="col-span-3"
        title="Активных аренд"
        value="38"
        unit="/54"
        icon={CLASSIC_KPI_ICONS.rent}
        iconTone="blue"
        foot={<span>70% загрузка</span>}
      />
      <ClassicKpi
        className="col-span-3"
        title="Задач на сегодня"
        value="7"
        icon={CLASSIC_KPI_ICONS.tasks}
        iconTone="orange"
        delta={{ tone: "down", label: "2 просрочены" }}
      />

      <ReturnsTable className="col-span-8" />
      <TasksList className="col-span-4" />
      <OverdueTable className="col-span-8" showPhoneColumn compactHeader />
      <ActivityFeed className="col-span-4" compact />
    </div>
  );
}
