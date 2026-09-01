import { ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type DeltaTone = "up" | "down" | "flat";

export type KpiCardProps = {
  title: React.ReactNode;
  value: string;
  unit?: string;
  foot?: React.ReactNode;
  delta?: { tone: DeltaTone; label: string };
  blue?: boolean;
  valueTone?: "default" | "red";
  /** v0.3.1 (idea 4): если задан — карточка кликабельна и
   *  открывает соответствующий drawer-список. */
  onClick?: () => void;
  /**
   * Тесная раскладка (01.09): когда справа открыта карточка, плитки
   * занимали пол-экрана, хотя человек и так видит эти цифры. Ужимаем —
   * освободившееся место отдаём «Выручке».
   */
  compact?: boolean;
};

export function KpiCard({
  title,
  value,
  unit,
  foot,
  delta,
  blue,
  valueTone = "default",
  onClick,
  compact,
}: KpiCardProps) {
  const clickable = !!onClick;
  return (
    <Card
      blue={blue}
      onClick={onClick}
      className={cn(
        clickable && "cursor-pointer transition-shadow hover:shadow-card-lg",
        compact && "p-3",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 font-medium",
          compact ? "text-[11.5px]" : "text-[13px]",
          blue ? "text-white/75" : "text-muted",
        )}
      >
        {title}
      </div>
      <GoButton blue={blue} />
      <div
        className={cn(
          "font-display tabular-nums leading-[1.1] tracking-[-0.02em] font-extrabold",
          compact ? "mt-1 text-[21px]" : "mt-3 text-[34px]",
          valueTone === "red" && !blue ? "text-red" : "",
        )}
      >
        {value}
        {unit && (
          <span
            className={cn(
              "ml-1 font-bold",
              compact ? "text-[13px]" : "text-[20px]",
              blue ? "text-white" : "text-muted",
            )}
          >
            {unit}
          </span>
        )}
      </div>
      <div
        className={cn(
          "flex items-center gap-1.5",
          compact ? "mt-1 text-[10.5px]" : "mt-2.5 text-xs",
          blue ? "text-white/75" : "text-muted",
        )}
      >
        {delta && <DeltaPill tone={delta.tone} label={delta.label} blue={blue} />}
        {foot}
      </div>
    </Card>
  );
}

export function Card({
  children,
  blue,
  className,
  ...rest
}: {
  children: React.ReactNode;
  blue?: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative rounded-xl p-[18px] shadow-card",
        blue ? "text-white" : "bg-surface",
        className,
      )}
      style={
        blue
          ? {
              background:
                "linear-gradient(135deg, hsl(var(--blue-600)) 0%, hsl(var(--blue)) 100%)",
            }
          : undefined
      }
      {...rest}
    >
      {children}
    </div>
  );
}

function GoButton({ blue }: { blue?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:translate-x-0.5 hover:-translate-y-0.5",
        blue ? "bg-white text-blue-600" : "bg-ink text-white",
      )}
    >
      <ArrowUpRight size={14} strokeWidth={2.2} />
    </button>
  );
}

export function DeltaPill({
  tone,
  label,
  blue,
}: {
  tone: DeltaTone;
  label: string;
  blue?: boolean;
}) {
  const cls = blue
    ? tone === "up"
      ? "bg-white/20 text-[#baffd6]"
      : tone === "down"
        ? "bg-white/20 text-[#ffc9c9]"
        : "bg-white/15 text-white/80"
    : tone === "up"
      ? "bg-green-soft text-green-ink"
      : tone === "down"
        ? "bg-red-soft text-red-ink"
        : "bg-surface-soft text-muted";

  const Icon =
    tone === "up" ? ChevronUp : tone === "down" ? ChevronDown : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-bold tracking-tight",
        cls,
      )}
    >
      {Icon && <Icon size={9} strokeWidth={3} />}
      {label}
    </span>
  );
}
