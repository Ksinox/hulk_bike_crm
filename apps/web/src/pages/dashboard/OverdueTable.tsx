import { useState } from "react";
import { Check, ChevronRight, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { mockOverdue, type OverdueItem } from "@/lib/mock/dashboard";
import { Card } from "./KpiCard";
import { StatusPill } from "./StatusPill";
import { ClientAvatar } from "./ReturnsList";

export function OverdueTable({
  className,
  showPhoneColumn = false,
  compactHeader = false,
}: {
  className?: string;
  showPhoneColumn?: boolean;
  compactHeader?: boolean;
}) {
  const sorted = [...mockOverdue].sort((a, b) => b.days - a.days);
  const top = sorted.slice(0, 5);
  const total = mockOverdue.length;

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
            {top.map((o, i) => (
              <OverdueRow
                key={i}
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
  return (
    <tr className="cursor-pointer group">
      <Td overdue>
        <div className="flex items-center gap-2.5">
          <ClientAvatar initials={o.initials} variant="red" />
          <div>
            <div className="font-semibold">{o.client}</div>
            <div className="text-[11px] text-muted">{o.phone}</div>
          </div>
        </div>
      </Td>
      <Td overdue>{o.scooter}</Td>
      <Td overdue>
        <span className="font-bold text-red-ink">{o.debt}</span>
      </Td>
      <Td overdue>
        <StatusPill tone="late">{o.days} дн</StatusPill>
      </Td>
      {showPhoneColumn ? (
        <Td overdue>
          <span className="text-[13px] text-muted">{o.phone}</span>
        </Td>
      ) : (
        <Td overdue>
          <CopyBtn phone={o.phone} />
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
