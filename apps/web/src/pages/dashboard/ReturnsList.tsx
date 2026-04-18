import {
  mockReturns,
  returnStatusLabel,
  type ReturnItem,
  type ReturnStatus,
} from "@/lib/mock/dashboard";
import { Card } from "./KpiCard";
import { StatusPill } from "./StatusPill";

const TONE: Record<ReturnStatus, "active" | "late" | "soon" | "done"> = {
  active: "active",
  late: "late",
  soon: "soon",
  done: "done",
};

export function ReturnsList({
  className,
  items = mockReturns.slice(0, 5),
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
        <StatusPill tone="active">{mockReturns.length}</StatusPill>
      </div>
      <div className="mb-1.5 text-xs text-muted">
        возврат в ближайшие 2 дня
      </div>
      <div>
        {items.map((r, i) => (
          <div
            key={i}
            className="flex cursor-pointer items-center gap-2.5 border-b border-border py-2.5 last:border-b-0 hover:-mx-2 hover:rounded-[10px] hover:bg-surface-soft hover:px-2"
          >
            <ClientAvatar initials={r.initials} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-ink">
                {r.client}
              </div>
              <div className="text-xs text-muted">
                {r.scooter} · {r.when}
              </div>
            </div>
            <StatusPill tone={TONE[r.status]}>
              {returnStatusLabel[r.status]}
            </StatusPill>
          </div>
        ))}
      </div>
    </Card>
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
