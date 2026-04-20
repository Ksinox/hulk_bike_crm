import { useEffect, useState } from "react";
import { Download, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UploadedFile } from "./DocUpload";

function isImageName(name: string): boolean {
  return /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i.test(name);
}

function isPdfName(name: string): boolean {
  return /\.pdf$/i.test(name);
}

export function FilePreviewModal({
  file,
  onClose,
}: {
  file: UploadedFile;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 160);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const src = file.thumbUrl;
  const isImg = !!src && isImageName(file.name);
  const isPdf = !!src && isPdfName(file.name);
  const hasLocalFile = !!src;

  const handleDownload = () => {
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[200] flex items-center justify-center bg-ink/70 p-6 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
      onClick={requestClose}
    >
      <div
        className={cn(
          "flex max-h-[90vh] w-full max-w-[900px] flex-col overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-ink">
              {file.title || file.name}
            </div>
            {file.comment && (
              <div className="truncate text-[11px] text-muted-2">
                {file.comment}
              </div>
            )}
            {file.title && file.name !== file.title && (
              <div className="truncate text-[11px] text-muted-2">
                {file.name}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!hasLocalFile}
            title={
              hasLocalFile
                ? "Скачать"
                : "Файл на сервере — скачивание будет после интеграции"
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
              hasLocalFile
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "cursor-not-allowed bg-surface-soft text-muted-2",
            )}
          >
            <Download size={14} /> Скачать
          </button>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-border hover:text-ink"
            title="Закрыть (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 items-center justify-center bg-surface-soft/50 p-4">
          {isImg && (
            <img
              src={src}
              alt={file.title || file.name}
              className="max-h-[72vh] max-w-full rounded-[8px] object-contain shadow-card"
            />
          )}
          {isPdf && (
            <iframe
              src={src}
              title={file.title || file.name}
              className="h-[72vh] w-full rounded-[8px] bg-white shadow-card"
            />
          )}
          {!isImg && !isPdf && (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-[14px] bg-blue-50 text-blue-700">
                <FileText size={28} />
              </div>
              <div>
                <div className="text-[14px] font-semibold text-ink">
                  Предпросмотр недоступен
                </div>
                <div className="mt-1 max-w-[360px] text-[12px] text-muted">
                  {hasLocalFile
                    ? "Скачайте файл чтобы открыть его в нужной программе."
                    : "Файл сохранён на сервере. После интеграции backend'а его можно будет открыть и скачать."}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
