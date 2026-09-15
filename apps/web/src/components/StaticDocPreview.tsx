import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Printer, ScrollText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

/**
 * Превью статического документа (без серверных данных) — например инструктаж
 * при передаче скутера. Рендерим готовый HTML в iframe srcDoc (чистая печать),
 * даём «Печать» и «Скачать Word». Текст документа фиксированный.
 */
export function StaticDocPreview({
  title,
  html,
  docFilename,
  onClose,
}: {
  title: string;
  html: string;
  docFilename: string;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handlePrint = () => {
    const ifr = iframeRef.current;
    if (!ifr?.contentWindow) return;
    ifr.contentWindow.focus();
    ifr.contentWindow.print();
    toast.info(
      "Подсказка для чистой печати",
      "В диалоге печати откройте «Ещё параметры» и снимите «Верхние и нижние колонтитулы».",
    );
  };

  const handleDownloadWord = () => {
    // Word открывает HTML с расширением .doc как обычный документ.
    const blob = new Blob([html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = docFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Документ скачан", "Откройте в Word для печати / подписи.");
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-stretch justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div
        className="relative flex w-full max-w-[960px] flex-col overflow-hidden rounded-2xl bg-surface shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <ScrollText size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
              Предпросмотр документа
            </div>
            <div className="truncate text-[15px] font-bold text-ink">
              {title}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={!ready}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold text-white transition-colors",
                ready ? "bg-ink hover:bg-blue-600" : "cursor-not-allowed bg-surface text-muted-2",
              )}
            >
              <Printer size={14} /> Печать
            </button>
            <button
              type="button"
              onClick={handleDownloadWord}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-4 py-2 text-[13px] font-bold text-blue-700 transition-colors hover:bg-blue-100"
            >
              <Download size={14} /> Скачать Word
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Закрыть (Esc)"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-2 hover:bg-white hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="relative flex-1 overflow-hidden bg-surface-soft">
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center text-muted">
              <Loader2 size={24} className="animate-spin" />
            </div>
          )}
          <iframe
            ref={iframeRef}
            srcDoc={html}
            title={title}
            onLoad={() => setReady(true)}
            className="h-full min-h-[70vh] w-full bg-white"
          />
        </div>
      </div>
    </div>
  );
}
