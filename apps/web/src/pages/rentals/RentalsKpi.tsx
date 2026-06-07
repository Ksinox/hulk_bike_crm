import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

type KpiTone = "neutral" | "green" | "red" | "orange" | "blue" | "purple";

type Kpi = {
  label: string;
  value: string;
  hint: string;
  tone: KpiTone;
  /** Если задан — плашка кликабельна (открывает детализацию). */
  onClick?: () => void;
};

const TONES: Record<KpiTone, string> = {
  neutral: "bg-surface-soft",
  green: "bg-green-soft/60",
  red: "bg-red-soft/60",
  orange: "bg-orange-soft/60",
  blue: "bg-blue-50",
  purple: "bg-purple-soft/60",
};

export function RentalsKpi({ items }: { items: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {items.map((it) => {
        const clickable = !!it.onClick;
        const Tag = clickable ? "button" : "div";
        return (
          <Tag
            key={it.label}
            type={clickable ? "button" : undefined}
            onClick={it.onClick}
            className={cn(
              "relative rounded-[14px] px-3 py-2.5 text-left",
              TONES[it.tone],
              clickable &&
                "group cursor-pointer transition-shadow hover:shadow-card-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
            )}
          >
            {clickable && (
              <Maximize2
                size={12}
                className="absolute right-2.5 top-2.5 text-muted-2 opacity-50 transition-opacity group-hover:opacity-100"
              />
            )}
            <div className="text-[11px] font-semibold text-muted-2">
              {it.label}
            </div>
            <div className="mt-0.5 font-display text-[20px] font-extrabold leading-none text-ink">
              {it.value}
            </div>
            <div className="mt-1 text-[11px] text-muted-2">{it.hint}</div>
          </Tag>
        );
      })}
    </div>
  );
}

export type { Kpi };
