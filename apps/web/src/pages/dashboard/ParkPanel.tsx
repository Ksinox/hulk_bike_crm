import { useMemo, useState } from "react";
import { Bike, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./KpiCard";
import { useApiRentals } from "@/lib/api/rentals";
import { useApiScooters } from "@/lib/api/scooters";
import type { ApiScooter, ScooterModel } from "@/lib/api/types";
import type { DashboardMetrics } from "./useDashboardMetrics";

/** Статус плитки — производный от baseStatus скутера + активной аренды. */
type TileStatus =
  | "rented"
  | "overdue"
  | "free"
  | "repair"
  | "for_sale"
  | "sold"
  | "disassembly";

type ModelFilter = "all" | ScooterModel;
type StatusFilter = "all" | TileStatus;

const MODEL_CHIPS: { id: ModelFilter; label: string }[] = [
  { id: "all", label: "Все модели" },
  { id: "jog", label: "Jog" },
  { id: "gear", label: "Gear" },
  { id: "honda", label: "Honda" },
  { id: "tank", label: "Tank" },
];

const STATUS_CHIPS: { id: StatusFilter; label: string; swatch: string }[] = [
  { id: "all", label: "всё", swatch: "hsl(var(--muted))" },
  { id: "rented", label: "аренда", swatch: "hsl(var(--blue))" },
  { id: "overdue", label: "просрочка", swatch: "hsl(var(--red))" },
  { id: "free", label: "свободен", swatch: "hsl(var(--border-strong))" },
  { id: "repair", label: "ремонт", swatch: "hsl(var(--orange))" },
  { id: "for_sale", label: "продажа", swatch: "hsl(var(--purple))" },
  { id: "disassembly", label: "разборка", swatch: "hsl(var(--ink))" },
  { id: "sold", label: "продан", swatch: "hsl(var(--border))" },
];

const STATUS_LABEL: Record<TileStatus, string> = {
  rented: "в аренде",
  overdue: "просрочен",
  free: "свободен",
  repair: "в ремонте",
  for_sale: "на продаже",
  sold: "продан",
  disassembly: "в разборке",
};

export function ParkPanel({
  className,
  metrics,
}: {
  className?: string;
  metrics: DashboardMetrics;
}) {
  const scootersQ = useApiScooters();
  const rentalsQ = useApiRentals();
  const [model, setModel] = useState<ModelFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [cols, setCols] = useState(12);

  const tiles = useMemo(() => {
    const scooters = scootersQ.data ?? [];
    const rentals = rentalsQ.data ?? [];

    const activeByScooter = new Map<number, "active" | "overdue">();
    rentals.forEach((r) => {
      if (r.scooterId == null) return;
      if (r.status === "active") activeByScooter.set(r.scooterId, "active");
      if (r.status === "overdue") activeByScooter.set(r.scooterId, "overdue");
    });

    return scooters.map((s) => ({
      id: s.id,
      name: s.name,
      model: s.model,
      status: computeTileStatus(s, activeByScooter.get(s.id)),
    }));
  }, [scootersQ.data, rentalsQ.data]);

  const modelCounts = useMemo(() => {
    const acc: Record<string, number> = {};
    tiles.forEach((t) => (acc[t.model] = (acc[t.model] ?? 0) + 1));
    return acc;
  }, [tiles]);

  const statusCounts = useMemo(() => {
    const acc: Record<string, number> = {};
    tiles.forEach((t) => (acc[t.status] = (acc[t.status] ?? 0) + 1));
    return acc;
  }, [tiles]);

  const total = tiles.length;
  const park = metrics.park;

  if (total === 0) {
    return (
      <Card className={className}>
        <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-soft text-muted-2">
            <Bike size={26} />
          </div>
          <div>
            <div className="text-[15px] font-bold text-ink">Парк пока пустой</div>
            <div className="mt-1 text-[13px] text-muted">
              Добавьте первый скутер на странице «Скутеры»
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="m-0 text-[20px] font-bold tracking-[-0.01em]">
            Парк · {total} {plural(total, ["скутер", "скутера", "скутеров"])}
          </h2>
          <div className="flex gap-4 text-xs text-muted">
            <span>
              загружено <b className="text-ink font-bold">{metrics.loadPercent}%</b>
            </span>
            <span>
              свободно <b className="text-ink font-bold">{park.ready}</b>
            </span>
            {park.inRepair > 0 && (
              <span>
                в ремонте <b className="text-ink font-bold">{park.inRepair}</b>
              </span>
            )}
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
        {tiles.map((s) => {
          const modelMatch = model === "all" || s.model === model;
          if (!modelMatch) return null;
          const statusMatch = status === "all" || s.status === status;
          const num = s.name.split("#")[1] ?? s.name;
          return (
            <div
              key={s.id}
              title={`${s.name} · ${STATUS_LABEL[s.status]}`}
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

function computeTileStatus(
  s: ApiScooter,
  activeKind: "active" | "overdue" | undefined,
): TileStatus {
  if (s.baseStatus === "sold") return "sold";
  if (s.baseStatus === "disassembly") return "disassembly";
  if (s.baseStatus === "for_sale" || s.baseStatus === "buyout")
    return "for_sale";
  if (s.baseStatus === "repair") return "repair";
  if (activeKind === "overdue") return "overdue";
  if (activeKind === "active") return "rented";
  return "free";
}

function tileClass(s: TileStatus): string {
  switch (s) {
    case "rented":
      return "bg-blue text-white";
    case "overdue":
      return "bg-red text-white";
    case "free":
      return "bg-surface-soft text-ink border-border";
    case "repair":
      return "bg-orange text-white";
    case "for_sale":
      return "bg-purple text-white";
    case "disassembly":
      return "bg-ink text-white";
    case "sold":
      return "bg-border text-muted";
  }
}

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
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
