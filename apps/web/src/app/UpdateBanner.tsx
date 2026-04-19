import { ArrowDownToLine, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { desktop, isElectron } from "@/platform";

type Phase = "idle" | "downloading" | "ready";

export function useDesktopUpdate() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    if (!isElectron) return;
    desktop.onUpdateAvailable(({ version: v }) => {
      setVersion(v);
      setPhase("downloading");
    });
    desktop.onUpdateDownloaded(({ version: v }) => {
      setVersion(v);
      setPhase("ready");
    });
  }, []);

  return { phase, version };
}

export function UpdateBanner({
  phase,
  version,
  expanded,
}: {
  phase: "idle" | "downloading" | "ready";
  version: string;
  expanded: boolean;
}) {
  if (!isElectron || phase === "idle") return null;

  const isReady = phase === "ready";

  return (
    <div
      className={cn(
        "mb-2 overflow-hidden rounded-[14px] transition-all",
        isReady
          ? "bg-blue-50 ring-1 ring-inset ring-blue-100"
          : "bg-surface-soft",
      )}
    >
      {expanded ? (
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            {isReady ? (
              <RefreshCw size={14} className="shrink-0 text-blue-600" />
            ) : (
              <ArrowDownToLine
                size={14}
                className="shrink-0 animate-pulse text-muted"
              />
            )}
            <span
              className={cn(
                "text-[12px] font-semibold leading-tight",
                isReady ? "text-blue-700" : "text-ink-2",
              )}
            >
              {isReady ? `Версия ${version} готова` : `Загрузка ${version}…`}
            </span>
          </div>

          {isReady && (
            <button
              type="button"
              onClick={() => desktop.quitAndInstall()}
              className="mt-2 w-full rounded-[10px] bg-blue-600 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Перезапустить
            </button>
          )}
        </div>
      ) : (
        <div className="relative flex h-11 w-full items-center justify-center">
          {isReady ? (
            <>
              <RefreshCw size={18} className="text-blue-600" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue-500" />
            </>
          ) : (
            <ArrowDownToLine
              size={18}
              className="animate-pulse text-muted"
            />
          )}
        </div>
      )}
    </div>
  );
}
