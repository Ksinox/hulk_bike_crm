import { useState } from "react";
import { Check, ChevronRight, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./KpiCard";
import { StatusPill } from "./StatusPill";
import { ClientAvatar } from "./ReturnsList";
import { formatRub, type OverdueItem } from "./useDashboardMetrics";

export function OverdueTable({
  className,
  items = [],
  showPhoneColumn = false,
  compactHeader = false,
}: {
  className?: string;
  items?: OverdueItem[];
  showPhoneColumn?: boolean;
  compactHeader?: boolean;
}) {
  const sorted = [...items].sort((a, b) => b.daysOverdue - a.daysOverdue);
  const top = sorted.slice(0, 5);
  const total = items.length;

  return (
    <Card className={className}>
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3
            className={cn(
              compactHeader
                ? "text-base font-bold"
                : "text-base font-bold tracking-[-0.005em]",
              "m-0",
            )}
          >
            Просроченные платежи
          </h3>
          {total > 0 && <StatusPill tone="late">{total}</StatusPill>}
        </div>
        {total > 0 && (
          <button className="inline-flex items-center gap-1.5 rounded-[10px] bg-surface-soft px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:bg-blue-50 hover:text-blue-700">
            Все долги <ChevronRight size={12} strokeWidth={2.2} />
          </button>
        )}
      </div>

      {total === 0 ? (
        <EmptyState />
      ) : (
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <Th style={{ width: "34%" }}>Клиент</Th>
              <Th>Скутер</Th>
              <Th>Долг</Th>
              <Th>Просрочка</Th>
              {showPhoneColumn && <Th>Телефон</Th>}
              {!showPhoneColumn && <Th />}
            </tr>
          </thead>
          <tbody>
            {top.map((o) => (
              <OverdueRow
                key={o.rentalId}
                item={o}
                showPhoneColumn={showPhoneColumn}
              />
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function OverdueRow({
  item: o,
  showPhoneColumn,
}: {
  item: OverdueItem;
  showPhoneColumn: boolean;
}) {
  const initials = initialsOf(o.clientName);
  return (
    <tr className="cursor-pointer group">
      <Td overdue>
        <div className="flex items-center gap-2.5">
          <ClientAvatar initials={initials} variant="red" />
          <div>
            <div className="font-semibold">{o.clientName}</div>
            <div className="text-[11px] text-muted">{o.clientPhone}</div>
          </div>
        </div>
      </Td>
      <Td overdue>{o.scooterName}</Td>
      <Td overdue>
        <span className="font-bold text-red-ink">{formatRub(o.debt)} ₽</span>
      </Td>
      <Td overdue>
        <StatusPill tone="late">{o.daysOverdue} дн</StatusPill>
      </Td>
      {showPhoneColumn ? (
        <Td overdue>
          <span className="text-[13px] text-muted">{o.clientPhone}</span>
        </Td>
      ) : (
        <Td overdue>
          <CopyBtn phone={o.clientPhone} />
        </Td>
      )}
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

function EmptyState() {
  return (
    <div className="flex items-center gap-2.5 px-0.5 py-1.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-green-soft text-green-ink">
        <Check size={16} strokeWidth={2.5} />
      </div>
      <div className="text-[13px] font-semibold text-ink">
        Просроченных платежей нет
      </div>
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

export function Th({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <th
      className="bg-surface-soft px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted first:rounded-l-xl last:rounded-r-xl"
      style={style}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  overdue,
}: {
  children?: React.ReactNode;
  overdue?: boolean;
}) {
  return (
    <td
      className={cn(
        "border-b border-border px-3.5 py-3 align-middle",
        overdue && "bg-red/[0.04] group-hover:bg-red/[0.08]",
        !overdue && "group-hover:bg-surface-soft",
      )}
    >
      {children}
    </td>
  );
}
