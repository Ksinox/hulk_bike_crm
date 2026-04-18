import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { mockActivity, type ActivityItem } from "@/lib/mock/dashboard";
import { Card } from "./KpiCard";
import { StatusPill } from "./StatusPill";

export function ActivityFeed({
  className,
  items = mockActivity,
  compact = false,
}: {
  className?: string;
  items?: ActivityItem[];
  compact?: boolean;
}) {
  return (
    <Card className={className}>
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3
            className={cn(
              compact
                ? "m-0 text-base font-bold"
                : "m-0 text-base font-bold tracking-[-0.005em]",
            )}
          >
            Последние действия
          </h3>
          <StatusPill tone="purple">директор</StatusPill>
        </div>
        <button className="inline-flex items-center gap-1.5 rounded-[10px] bg-surface-soft px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:bg-blue-50 hover:text-blue-700">
          Весь журнал <ChevronRight size={12} strokeWidth={2.2} />
        </button>
      </div>
      <div>
        {items.map((a, i) => (
          <div
            key={i}
            className="flex gap-2.5 border-b border-border py-2.5 last:border-b-0"
          >
            <div
              className={cn(
                "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                a.system
                  ? "bg-surface-soft text-muted"
                  : "bg-blue-50 text-blue-700",
              )}
            >
              {a.initials}
            </div>
            <div className="min-w-0 flex-1 text-[13px] text-ink-2">
              <div
                dangerouslySetInnerHTML={{
                  __html: `<b class="text-ink font-bold">${a.who}</b> ${a.body}`,
                }}
              />
              <div className="mt-0.5 text-[11px] text-muted">{a.when}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
