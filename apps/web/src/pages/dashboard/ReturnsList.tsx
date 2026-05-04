import { Check, Phone } from "lucide-react";
import { Card } from "./KpiCard";
import { StatusPill } from "./StatusPill";
import { navigate } from "@/app/navigationStore";
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
            const phoneHref = phoneToTel(r.clientPhone);
            return (
              <div
                key={r.rentalId}
                onClick={() =>
                  navigate({ route: "rentals", rentalId: r.rentalId })
                }
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    navigate({ route: "rentals", rentalId: r.rentalId });
                  }
                }}
                title="Открыть карточку аренды"
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
                  {r.clientPhone && (
                    <a
                      href={phoneHref}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 inline-flex items-center gap-1 font-mono text-[12px] font-bold text-ink hover:text-blue-600"
                    >
                      <Phone size={11} className="text-muted-2" />
                      {r.clientPhone}
                    </a>
                  )}
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

function phoneToTel(phone: string): string {
  const digits = (phone || "").replace(/[^\d+]/g, "");
  if (!digits) return "#";
  return `tel:${digits.startsWith("+") ? digits : `+${digits}`}`;
}
