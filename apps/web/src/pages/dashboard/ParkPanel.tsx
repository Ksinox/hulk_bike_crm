import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  mockPark,
  scootStatusLabel,
  type ParkItem,
  type ScootModel,
  type ScootStatus,
} from "@/lib/mock/dashboard";
import { Card } from "./KpiCard";

type ModelFilter = "all" | ScootModel;
type StatusFilter = "all" | ScootStatus;

const MODEL_CHIPS: { id: ModelFilter; label: string }[] = [
  { id: "all", label: "Все модели" },
  { id: "Yamaha Jog", label: "Jog" },
  { id: "Yamaha Gear", label: "Gear" },
  { id: "Tank", label: "Tank" },
];

const STATUS_CHIPS: { id: StatusFilter; label: string; swatch: string }[] = [
  { id: "all", label: "всё", swatch: "hsl(var(--muted))" },
  { id: "rented", label: "аренда", swatch: "hsl(var(--blue))" },
  { id: "overdue", label: "просрочка", swatch: "hsl(var(--red))" },
  { id: "free", label: "свободен", swatch: "hsl(var(--border-strong))" },
  { id: "repair", label: "ремонт", swatch: "hsl(var(--orange))" },
  { id: "rassrochka", label: "рассрочка", swatch: "hsl(var(--purple))" },
  { id: "sold", label: "продан", swatch: "hsl(var(--border))" },
];

function countBy<K extends string>(items: ParkItem[], pick: (p: ParkItem) => K) {
  return items.reduce<Record<K, number>>(
    (acc, p) => {
      const k = pick(p);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    },
    {} as Record<K, number>,
  );
}

export function ParkPanel({ className }: { className?: string }) {
  const [model, setModel] = useState<ModelFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [cols, setCols] = useState(12);

  const modelCounts = useMemo(
    () => countBy(mockPark, (p) => p.model),
    [],
  );
  const statusCounts = useMemo(
    () => countBy(mockPark, (p) => p.status),
    [],
  );
  const total = mockPark.length;

  const filtered = mockPark;

  return (
    <Card className={className}>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="m-0 text-[20px] font-bold tracking-[-0.01em]">
            Парк · 54 скутера
          </h2>
          <div className="flex gap-4 text-xs text-muted">
            <span>
              загружен <b className="text-ink font-bold">70%</b>
            </span>
            <span>
              свободно <b className="text-ink font-bold">10</b>
            </span>
            <span>
              в ремонте <b className="text-ink font-bold">3</b>
            </span>
          </div>
        </div>
        <ChipRow>
          {MODEL_CHIPS.map((c) => (
            <Chip
              key={c.id}
              active={model === c.id}
              onClick={() => setModel(c.id)}
            >
              {c.label}{" "}
              <Count active={model === c.id}>
                {c.id === "all" ? total : modelCounts[c.id] ?? 0}
              </Count>
            </Chip>
          ))}
        </ChipRow>
      </div>

      <ChipRow className="mb-2.5">
        {STATUS_CHIPS.map((c) => (
          <Chip
            key={c.id}
            active={status === c.id}
            onClick={() => setStatus(c.id)}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: c.swatch }}
            />
            {c.label}{" "}
            <Count active={status === c.id}>
              {c.id === "all" ? total : statusCounts[c.id] ?? 0}
            </Count>
          </Chip>
        ))}
      </ChipRow>

      <div className="mb-3 flex items-center gap-2.5 rounded-xl bg-surface-soft px-3 py-2 text-xs text-muted">
        <Minus size={14} className="text-muted" />
        <span>масштаб</span>
        <input
          type="range"
          min={6}
          max={18}
          step={1}
          value={cols}
          onChange={(e) => setCols(Number(e.target.value))}
          className="max-w-[200px] flex-1"
          style={{ accentColor: "hsl(var(--blue-600))" }}
        />
        <Plus size={14} className="text-muted" />
        <span className="min-w-[70px] text-right">{cols} в ряду</span>
      </div>

      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {filtered.map((s) => {
          const modelMatch = model === "all" || s.model === model;
          if (!modelMatch) return null;
          const statusMatch = status === "all" || s.status === status;
          const num = s.name.split("#")[1] ?? "";
          return (
            <div
              key={s.name}
              title={`${s.name} · ${scootStatusLabel[s.status]}`}
              className={cn(
                "group relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-[10px] border border-transparent text-[11px] font-semibold transition-all hover:-translate-y-0.5 hover:z-10 hover:shadow-card",
                tileClass(s.status),
                !statusMatch && "opacity-20",
              )}
            >
              {num}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function tileClass(s: ScootStatus): string {
  switch (s) {
    case "rented":
      return "bg-blue text-white";
    case "overdue":
      return "bg-red text-white";
    case "free":
      return "bg-surface-soft text-ink border-border";
    case "repair":
      return "bg-orange text-white";
    case "rassrochka":
      return "bg-purple text-white";
    case "sold":
      return "bg-border text-muted";
  }
}

export function ChipRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>{children}</div>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
        active
          ? "border-ink bg-ink text-white"
          : "border-border bg-surface-soft text-muted hover:border-blue-100 hover:bg-blue-50 hover:text-blue-700",
      )}
    >
      {children}
    </button>
  );
}

export function Count({
  active,
  children,
}: {
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "font-medium",
        active ? "text-white/70" : "text-muted-2",
      )}
    >
      {children}
    </span>
  );
}
