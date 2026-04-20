import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { desktop, isElectron } from "@/platform";

type Phase = "idle" | "ready";

export function useDesktopUpdate() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    if (!isElectron) return;
    // Загрузку обновления не показываем — она идёт фоном.
    // Банер появляется только когда версия уже скачана и готова к перезапуску.
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
  phase: Phase;
  version: string;
  expanded: boolean;
}) {
  if (!isElectron || phase !== "ready") return null;

  return (
    <div
      className={cn(
        "mb-2 overflow-hidden rounded-[14px] bg-blue-50 ring-1 ring-inset ring-blue-100 transition-all",
      )}
    >
      {expanded ? (
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <RefreshCw size={14} className="shrink-0 text-blue-600" />
            <span className="text-[12px] font-semibold leading-tight text-blue-700">
              Версия {version} готова
            </span>
          </div>
          <button
            type="button"
            onClick={() => desktop.quitAndInstall()}
            className="mt-2 w-full rounded-[10px] bg-blue-600 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Перезапустить
          </button>
        </div>
      ) : (
        <div className="relative flex h-11 w-full items-center justify-center">
          <RefreshCw size={18} className="text-blue-600" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue-500" />
        </div>
      )}
    </div>
  );
}
