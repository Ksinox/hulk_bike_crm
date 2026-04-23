import { Activity } from "lucide-react";
import { Card } from "./KpiCard";

export function ActivityFeed({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <Card className={className}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className={compact ? "m-0 text-base font-bold" : "m-0 text-base font-bold tracking-[-0.005em]"}>
          Последние действия
        </h3>
        <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-2">
          скоро
        </span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2.5 py-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-soft text-muted-2">
          <Activity size={22} />
        </div>
        <div className="max-w-[260px] text-[13px] text-muted">
          Лог действий сотрудников появится в следующем обновлении
        </div>
      </div>
    </Card>
  );
}
