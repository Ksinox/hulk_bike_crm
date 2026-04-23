import { useState } from "react";
import { Check, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./KpiCard";
import { StatusPill } from "./StatusPill";
import { ClientAvatar } from "./ReturnsList";
import { Td, Th } from "./OverdueTable";
import type { ReturnItem } from "./useDashboardMetrics";

export function ReturnsTable({
  className,
  items = [],
}: {
  className?: string;
  items?: ReturnItem[];
}) {
  return (
    <Card className={className}>
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="m-0 text-[20px] font-bold tracking-[-0.01em]">
            Сегодня возвращают
          </h2>
          {items.length > 0 && <StatusPill tone="active">{items.length}</StatusPill>}
        </div>
      </div>
      {items.length === 0 ? (
        <div className="flex items-center gap-2.5 px-0.5 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-green-soft text-green-ink">
            <Check size={16} strokeWidth={2.5} />
          </div>
          <div className="text-[13px] font-semibold text-ink">
            Возвратов на сегодня не запланировано
          </div>
        </div>
      ) : (
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <Th style={{ width: "28%" }}>Клиент</Th>
              <Th>Скутер</Th>
              <Th>Время</Th>
              <Th>Телефон</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <Row key={r.rentalId} r={r} />
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function Row({ r }: { r: ReturnItem }) {
  const initials = initialsOf(r.clientName);
  const time = formatTime(r.endPlannedAt);
  return (
    <tr className="group cursor-pointer">
      <Td>
        <div className="flex items-center gap-2.5">
          <ClientAvatar initials={initials} />
          <div>
            <div className="font-semibold">{r.clientName}</div>
            <div className="text-[11px] text-muted">{r.clientPhone}</div>
          </div>
        </div>
      </Td>
      <Td>{r.scooterName}</Td>
      <Td>{time}</Td>
      <Td>
        <span className="text-[13px] text-muted">{r.clientPhone}</span>
      </Td>
      <Td>
        <CopyBtn phone={r.clientPhone} />
      </Td>
    </tr>
  );
}

function CopyBtn({ phone }: { phone: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      navigator.clipboard?.writeText(phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* noop */
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-colors",
        copied ? "bg-green text-white" : "bg-ink text-white hover:bg-blue-600",
      )}
    >
      {copied ? <Check size={12} strokeWidth={2.5} /> : <Phone size={12} />}
      {copied ? "Скопировано" : "Позвонить"}
    </button>
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
