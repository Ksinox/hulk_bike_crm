import { Minus, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isElectron, desktop } from "@/platform";

const btnBase =
  "flex h-9 w-11 items-center justify-center transition-colors text-ink-2";

export function TitleBar() {
  if (!isElectron) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex h-9 select-none items-center bg-bg"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <span className="pl-4 text-[12px] font-semibold tracking-wide text-ink-2">
        Халк Байк CRM
      </span>

      <div
        className="ml-auto flex"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          type="button"
          className={cn(btnBase, "hover:bg-surface hover:text-ink")}
          onClick={() => desktop.minimize()}
          aria-label="Свернуть"
        >
          <Minus size={12} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={cn(btnBase, "hover:bg-surface hover:text-ink")}
          onClick={() => desktop.maximize()}
          aria-label="Развернуть"
        >
          <Square size={11} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={cn(btnBase, "hover:bg-red-500 hover:text-white")}
          onClick={() => desktop.close()}
          aria-label="Закрыть"
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
