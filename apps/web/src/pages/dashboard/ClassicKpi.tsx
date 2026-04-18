import {
  Bike,
  CircleAlert,
  ClipboardCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, DeltaPill } from "./KpiCard";

type Tone = "blue" | "green" | "red" | "orange";

const toneCls: Record<Tone, string> = {
  blue: "bg-blue-50 text-blue-700",
  green: "bg-green-soft text-green-ink",
  red: "bg-red-soft text-red-ink",
  orange: "bg-orange-soft text-orange-ink",
};

export type ClassicKpiProps = {
  title: string;
  value: string;
  unit?: string;
  foot?: React.ReactNode;
  delta?: { tone: "up" | "down" | "flat"; label: string };
  icon: LucideIcon;
  iconTone: Tone;
  valueRed?: boolean;
  className?: string;
};

export function ClassicKpi({
  title,
  value,
  unit,
  foot,
  delta,
  icon: Icon,
  iconTone,
  valueRed,
  className,
}: ClassicKpiProps) {
  return (
    <Card className={className}>
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl",
            toneCls[iconTone],
          )}
        >
          <Icon size={20} strokeWidth={2.2} />
        </div>
        <div className="flex-1">
          <div className="text-[13px] font-medium text-muted">{title}</div>
          <div
            className={cn(
              "mt-1.5 font-display text-[28px] font-extrabold leading-[1.1] tabular-nums tracking-[-0.02em]",
              valueRed && "text-red",
            )}
          >
            {value}
            {unit && (
              <span className="ml-1 text-base font-bold text-muted">
                {unit}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
            {delta && <DeltaPill tone={delta.tone} label={delta.label} />}
            {foot}
          </div>
        </div>
      </div>
    </Card>
  );
}

export const CLASSIC_KPI_ICONS = {
  money: Wallet,
  alert: CircleAlert,
  rent: Bike,
  tasks: ClipboardCheck,
} as const;
