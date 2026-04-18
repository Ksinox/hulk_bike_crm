import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type KpiCardProps = {
  title: string;
  value: string;
  icon: LucideIcon;
  delta?: number;
  deltaLabel?: string;
  tone?: "default" | "success" | "warning" | "destructive";
};

const toneClasses: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

export function KpiCard({
  title,
  value,
  icon: Icon,
  delta,
  deltaLabel,
  tone = "default",
}: KpiCardProps) {
  const deltaPositive = (delta ?? 0) >= 0;
  return (
    <Card className="hover:shadow-card-hover transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">{title}</div>
            <div className="text-2xl font-semibold leading-tight">{value}</div>
          </div>
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              toneClasses[tone],
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {delta !== undefined && (
          <div className="mt-3 flex items-center gap-1.5 text-xs">
            {deltaPositive ? (
              <TrendingUp className="h-3.5 w-3.5 text-success" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-destructive" />
            )}
            <span
              className={cn(
                "font-medium",
                deltaPositive ? "text-success" : "text-destructive",
              )}
            >
              {deltaPositive ? "+" : ""}
              {delta}
              {typeof delta === "number" && deltaLabel?.includes("%")
                ? ""
                : ""}
            </span>
            <span className="text-muted-foreground">
              {deltaLabel ?? "к прошлой неделе"}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
