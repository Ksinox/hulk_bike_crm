import { useState } from "react";
import { Check, Phone, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  mockReturns,
  returnStatusLabel,
  type ReturnItem,
} from "@/lib/mock/dashboard";
import { Card } from "./KpiCard";
import { StatusPill } from "./StatusPill";
import { ClientAvatar } from "./ReturnsList";
import { Td, Th } from "./OverdueTable";

export function ReturnsTable({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="m-0 text-[20px] font-bold tracking-[-0.01em]">
            Сегодня возвращают
          </h2>
          <StatusPill tone="active">{mockReturns.length}</StatusPill>
        </div>
        <div className="flex gap-1.5">
          <button className="inline-flex items-center gap-1.5 rounded-[10px] bg-surface-soft px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-blue-50 hover:text-blue-700">
            Фильтры
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-[10px] bg-ink px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600">
            <Plus size={12} strokeWidth={2.5} />
            Новая аренда
          </button>
        </div>
      </div>
      <table className="w-full border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            <Th style={{ width: "28%" }}>Клиент</Th>
            <Th>Скутер</Th>
            <Th>Срок</Th>
            <Th>Статус</Th>
            <Th>Телефон</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {mockReturns.map((r, i) => (
            <Row key={i} r={r} />
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Row({ r }: { r: ReturnItem }) {
  const late = r.status === "late";
  return (
    <tr className="group cursor-pointer">
      <Td overdue={late}>
        <div className="flex items-center gap-2.5">
          <ClientAvatar initials={r.initials} variant={late ? "red" : "blue"} />
          <div>
            <div className="font-semibold">{r.client}</div>
            <div className="text-[11px] text-muted">{r.phone}</div>
          </div>
        </div>
      </Td>
      <Td overdue={late}>{r.scooter}</Td>
      <Td overdue={late}>
        <span className={cn(late && "font-semibold text-red-ink")}>
          {r.when}
        </span>
      </Td>
      <Td overdue={late}>
        <StatusPill tone={r.status === "done" ? "done" : r.status}>
          {returnStatusLabel[r.status]}
        </StatusPill>
      </Td>
      <Td overdue={late}>
        <span className="text-[13px] text-muted">{r.phone}</span>
      </Td>
      <Td overdue={late}>
        <CopyBtn phone={r.phone} />
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
