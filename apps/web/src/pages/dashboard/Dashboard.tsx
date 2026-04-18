import {
  Wallet,
  Bike,
  AlertCircle,
  ListChecks,
  Search,
  Bell,
  Plus,
} from "lucide-react";
import { KpiCard } from "./KpiCard";
import { RevenueChart } from "./RevenueChart";
import { SourceChart } from "./SourceChart";
import { RentalsTable } from "./RentalsTable";
import { Button } from "@/components/ui/button";
import { mockKpi } from "@/lib/mock/dashboard";
import { formatRub, formatNumber } from "@/lib/utils";

export function Dashboard() {
  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <header className="flex items-center justify-between border-b bg-card px-8 py-4">
        <div>
          <div className="text-xs text-muted-foreground">Добро пожаловать</div>
          <h1 className="text-xl font-semibold">Дашборд</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Поиск клиентов, сделок, скутеров…"
              className="h-9 w-80 rounded-md border border-border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button variant="outline" size="icon" aria-label="Уведомления">
            <Bell className="h-4 w-4" />
          </Button>
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Новая аренда
          </Button>
        </div>
      </header>

      <main className="flex-1 space-y-6 p-8">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Выручка сегодня"
            value={formatRub(mockKpi.revenueToday)}
            icon={Wallet}
            delta={mockKpi.revenueTodayDelta}
            deltaLabel="% ко вчера"
            tone="success"
          />
          <KpiCard
            title="Активных аренд"
            value={formatNumber(mockKpi.activeRentals)}
            icon={Bike}
            delta={mockKpi.activeRentalsDelta}
            deltaLabel="за неделю"
          />
          <KpiCard
            title="Просрочки"
            value={formatNumber(mockKpi.overduePayments)}
            icon={AlertCircle}
            delta={mockKpi.overduePaymentsAmount}
            deltaLabel="₽ общий долг"
            tone="destructive"
          />
          <KpiCard
            title="Задачи на сегодня"
            value={formatNumber(mockKpi.openTasks)}
            icon={ListChecks}
            delta={mockKpi.openTasksUrgent}
            deltaLabel="срочных"
            tone="warning"
          />
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <RevenueChart />
          <SourceChart />
        </section>

        <section>
          <RentalsTable />
        </section>
      </main>
    </div>
  );
}
