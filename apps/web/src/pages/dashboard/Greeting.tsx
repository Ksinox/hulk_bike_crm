import { ChevronDown, LayoutGrid, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardView } from "./view";

export function Greeting({
  view,
  onViewChange,
}: {
  view: DashboardView;
  onViewChange: (v: DashboardView) => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display m-0 flex items-center gap-2.5 text-[28px] leading-[1.15] tracking-[-0.02em]">
          Доброе утро, Даниил!
          <span
            className="inline-flex animate-wave-hand"
            style={{ transformOrigin: "70% 70%" }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path
                d="M14.5 2.5c-.8-.8-2.2-.8-3 0L2.5 11.5c-.8.8-.8 2.2 0 3l7 7c.8.8 2.2.8 3 0l9-9c.8-.8.8-2.2 0-3l-7-7z"
                fill="#fbbf24"
                stroke="#f59e0b"
                strokeWidth="1"
              />
              <circle cx="11" cy="7" r="1" fill="#7c2d12" />
              <circle cx="7" cy="11" r="1" fill="#7c2d12" />
            </svg>
          </span>
        </h1>
        <div className="mt-1 text-sm text-muted">
          3 просрочки, 7 задач на сегодня, парк загружен на 70%
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="inline-flex gap-0.5 rounded-full bg-surface p-1 shadow-card-sm">
          <ViewButton
            active={view === "park"}
            onClick={() => onViewChange("park")}
          >
            <LayoutGrid size={14} />
            Парк
          </ViewButton>
          <ViewButton
            active={view === "classic"}
            onClick={() => onViewChange("classic")}
          >
            <Menu size={14} />
            Классика
          </ViewButton>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-border-strong bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink-2"
        >
          Этот месяц
          <ChevronDown size={14} />
        </button>
      </div>
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors",
        active
          ? "bg-ink text-white"
          : "bg-transparent text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
