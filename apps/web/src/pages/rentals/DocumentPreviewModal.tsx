import { useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, Printer, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

/**
 * Модалка предпросмотра документа внутри CRM.
 * Внутри iframe с HTML-документа (по URL с API), сверху кнопки:
 *   • Печать (iframe.contentWindow.print)
 *   • Скачать Word (.doc)
 *   • Закрыть
 *
 * Иконки/подсказки на панели печати браузера (колонтитулы и адрес) убираем
 * через подсказку пользователю: в диалоге печати «Ещё параметры → Верхние
 * и нижние колонтитулы: Нет». Программно это не отключается через web API.
 */
export function DocumentPreviewModal({
  title,
  htmlUrl,
  docxUrl,
  docxFilename,
  onClose,
}: {
  title: string;
  htmlUrl: string;
  docxUrl: string;
  docxFilename: string;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * Загружаем HTML через fetch и кладём в iframe через srcdoc.
   * Это делает iframe same-origin с нашей CRM, и iframe.contentWindow.print()
   * работает без блокировки браузером (кросс-оригин iframe не даёт вызывать print).
   */
  useEffect(() => {
    let cancelled = false;
    setIframeReady(false);
    setHtmlContent(null);
    fetch(htmlUrl, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (!cancelled) setHtmlContent(text);
      })
      .catch((e) => {
        if (!cancelled) {
          toast.error(
            "Не удалось загрузить документ",
            (e as Error).message ?? "",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [htmlUrl]);

  const handlePrint = () => {
    const ifr = iframeRef.current;
    if (!ifr || !ifr.contentWindow) {
      toast.warn("Документ ещё не загрузился", "Подождите секунду");
      return;
    }
    setPrinting(true);
    try {
      ifr.contentWindow.focus();
      ifr.contentWindow.print();
    } catch {
      /* noop — диалог печати может уже быть открыт */
    } finally {
      setTimeout(() => setPrinting(false), 600);
    }
    toast.info(
      "Подсказка для чистой печати",
      "В диалоге печати откройте «Ещё параметры» и снимите «Верхние и нижние колонтитулы» — тогда URL и дата не напечатаются.",
    );
  };

  const handleDownloadWord = async () => {
    setDownloading(true);
    try {
      const res = await fetch(docxUrl, { credentials: "include" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = docxFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(
        "Документ скачан",
        "Откройте в Word для подписания / печати.",
      );
    } catch (e) {
      toast.error("Не удалось скачать", (e as Error).message ?? "");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-stretch justify-center bg-ink/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-[960px] flex-col overflow-hidden rounded-2xl bg-surface shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <FileText size={16} />
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
              disabled={!iframeReady || printing}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold text-white transition-colors",
                iframeReady && !printing
                  ? "bg-ink hover:bg-blue-600"
                  : "cursor-not-allowed bg-surface text-muted-2",
              )}
            >
              {printing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Printer size={14} />
              )}
              Печать
            </button>
            <button
              type="button"
              onClick={handleDownloadWord}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-4 py-2 text-[13px] font-bold text-blue-700 transition-colors hover:bg-blue-100"
            >
              {downloading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              Скачать Word
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

        {/* Hint */}
        <div className="border-b border-border bg-blue-50/60 px-5 py-2 text-[11px] text-blue-900">
          Чтобы сохранить <b>PDF</b> — нажмите «Печать» и в диалоге браузера
          выберите «Сохранить как PDF». Для <b>Word</b> используйте кнопку
          «Скачать Word» — файл можно открыть и подкорректировать в Microsoft
          Word.
        </div>

        {/* Iframe preview */}
        <div className="relative flex-1 overflow-hidden bg-surface-soft">
          {(!iframeReady || !htmlContent) && (
            <div className="absolute inset-0 flex items-center justify-center text-muted">
              <Loader2 size={24} className="animate-spin" />
            </div>
          )}
          {htmlContent && (
            <iframe
              ref={iframeRef}
              srcDoc={htmlContent}
              title={title}
              onLoad={() => setIframeReady(true)}
              className="h-full min-h-[70vh] w-full bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}
