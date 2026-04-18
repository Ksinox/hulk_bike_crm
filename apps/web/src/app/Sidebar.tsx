import {
  LayoutDashboard,
  Users,
  Bike,
  FileSignature,
  Wrench,
  ListChecks,
  BarChart3,
  Settings,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
};

const items: NavItem[] = [
  { id: "dashboard", label: "Дашборд", icon: LayoutDashboard, active: true },
  { id: "clients", label: "Клиенты", icon: Users },
  { id: "fleet", label: "Парк", icon: Bike },
  { id: "rentals", label: "Аренды", icon: FileSignature },
  { id: "service", label: "Ремонты", icon: Wrench },
  { id: "incidents", label: "Инциденты", icon: AlertTriangle },
  { id: "tasks", label: "Задачи", icon: ListChecks },
  { id: "analytics", label: "Аналитика", icon: BarChart3 },
  { id: "settings", label: "Настройки", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-card">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Bike className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">Халк Байк</div>
          <div className="text-xs text-muted-foreground">CRM v0.1.0</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                item.active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
      <div className="border-t px-5 py-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-muted" />
          <div>
            <div className="font-medium text-foreground">Дмитрий</div>
            <div>Администратор</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
