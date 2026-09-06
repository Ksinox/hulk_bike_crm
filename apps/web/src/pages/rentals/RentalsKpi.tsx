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
  /**
   * Переключатель периода внутри плашки (06.09, п.1: «Возвраты» —
   * сегодня по умолчанию, можно на неделю). Рисуется вместо подсказки.
   */
  toggle?: {
    options: { id: string; label: string }[];
    value: string;
    onChange: (id: string) => void;
  };
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
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5 min-[2000px]:gap-3">
      {items.map((it) => {
        const clickable = !!it.onClick;
        // Плашка с переключателем внутри — div: кнопка в кнопке невалидна.
        const Tag = clickable && !it.toggle ? "button" : "div";
        return (
          <Tag
            key={it.label}
            type={Tag === "button" ? "button" : undefined}
            role={clickable && Tag === "div" ? "button" : undefined}
            tabIndex={clickable && Tag === "div" ? 0 : undefined}
            onKeyDown={
              clickable && Tag === "div"
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") it.onClick?.();
                  }
                : undefined
            }
            onClick={it.onClick}
            className={cn(
              "relative rounded-[14px] px-2.5 py-2 text-left min-[2000px]:px-3 min-[2000px]:py-2.5",
              TONES[it.tone],
              clickable &&
                "group cursor-pointer transition-shadow hover:shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
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
            <div className="mt-0.5 font-display text-[17px] font-extrabold leading-none text-ink min-[2000px]:text-[20px]">
              {it.value}
            </div>
            {it.toggle ? (
              <div
                className="mt-1 inline-flex rounded-full bg-white/70 p-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                {it.toggle.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      it.toggle!.onChange(o.id);
                    }}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10.5px] font-semibold transition-colors",
                      it.toggle!.value === o.id
                        ? "bg-ink text-white"
                        : "text-muted hover:text-ink",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-1 text-[10.5px] text-muted-2 min-[2000px]:text-[11px]">
                {it.hint}
              </div>
            )}
          </Tag>
        );
      })}
    </div>
  );
}

export type { Kpi };
