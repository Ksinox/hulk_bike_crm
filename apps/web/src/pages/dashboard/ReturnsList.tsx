import { Check } from "lucide-react";
import { Card } from "./KpiCard";
import { StatusPill } from "./StatusPill";
import type { ReturnItem } from "./useDashboardMetrics";

export function ReturnsList({
  className,
  items = [],
}: {
  className?: string;
  items?: ReturnItem[];
}) {
  return (
    <Card className={className}>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="m-0 text-base font-bold tracking-[-0.005em]">
          Сегодня возвращают
        </h3>
        {items.length > 0 && <StatusPill tone="active">{items.length}</StatusPill>}
      </div>
      <div className="mb-1.5 text-xs text-muted">
        {items.length > 0
          ? "возврат в течение дня"
          : "на сегодня возвратов не запланировано"}
      </div>
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div>
          {items.slice(0, 5).map((r) => {
            const initials = initialsOf(r.clientName);
            const when = formatTime(r.endPlannedAt);
            return (
              <div
                key={r.rentalId}
                className="flex cursor-pointer items-center gap-2.5 border-b border-border py-2.5 last:border-b-0 hover:-mx-2 hover:rounded-[10px] hover:bg-surface-soft hover:px-2"
              >
                <ClientAvatar initials={initials} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-ink truncate">
                    {r.clientName}
                  </div>
                  <div className="text-xs text-muted truncate">
                    {r.scooterName} · {when}
                  </div>
                </div>
                <StatusPill tone="active">{when}</StatusPill>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center gap-2.5 px-0.5 py-1.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-green-soft text-green-ink">
        <Check size={16} strokeWidth={2.5} />
      </div>
      <div className="text-[13px] font-semibold text-ink">Возвратов не запланировано</div>
    </div>
  );
}

export function ClientAvatar({
  initials,
  variant = "blue",
}: {
  initials: string;
  variant?: "blue" | "red";
}) {
  const cls =
    variant === "red"
      ? "bg-red-soft text-red-ink"
      : "bg-blue-50 text-blue-700";
  return (
    <div
      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px] text-xs font-bold ${cls}`}
    >
      {initials}
    </div>
  );
}

function initialsOf(name: string): string {
  return (name || "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
