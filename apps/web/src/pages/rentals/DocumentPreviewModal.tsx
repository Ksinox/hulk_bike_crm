import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  FileText,
  Loader2,
  Pencil,
  Printer,
  RefreshCw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { TemplateEditorPage } from "@/pages/documents/editor/TemplateEditorPage";

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
  templateKey,
  templateName,
  onClose,
}: {
  title: string;
  htmlUrl: string;
  docxUrl: string;
  docxFilename: string;
  /** Если задан — в шапке появится кнопка «Подправить шаблон»,
   *  которая прямо здесь же открывает редактор шаблона. После
   *  возврата превью перерисовывается со свежим override. */
  templateKey?: string;
  templateName?: string;
  onClose: () => void;
}) {
  const [editingTemplate, setEditingTemplate] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  /**
   * Cache-buster: при каждом ре-рендере с новым reloadKey fetch перезапускается
   * (URL уникален), и сервер возвращает свежий HTML с актуальными данными
   * клиента/скутера. Кнопка «Обновить» в шапке ставит новый Date.now().
   *
   * Это решение для случая «поменяли паспорт клиента, а превью договора
   * показывает старое»: один клик и видно свежий документ.
   */
  const [reloadKey, setReloadKey] = useState<number>(() => Date.now());

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
    // Прибавляем reloadKey к URL — для cache-bust и принудительного fetch
    // при нажатии «Обновить». Сервер не кеширует (документы динамические).
    const sep = htmlUrl.includes("?") ? "&" : "?";
    const url = `${htmlUrl}${sep}_ts=${reloadKey}`;
    fetch(url, { credentials: "include" })
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
  }, [htmlUrl, reloadKey]);

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

  // В режиме редактирования шаблона раскрываем модалку на весь экран —
  // редактору нужен простор: тулбар форматирования, sidebar переменных,
  // длинный текст шаблона. В режиме предпросмотра — компактная модалка
  // 960px достаточно (документ A4-формата).
  const containerClass = editingTemplate
    ? "fixed inset-0 z-[120] flex items-stretch justify-center bg-ink/60 backdrop-blur-sm"
    : "fixed inset-0 z-[120] flex items-stretch justify-center bg-ink/60 p-4 backdrop-blur-sm";

  return (
    <div
      className={containerClass}
      onClick={onClose}
    >
      <div
        className={
          editingTemplate
            ? "relative flex h-full w-full flex-col overflow-hidden bg-surface"
            : "relative flex w-full max-w-[960px] flex-col overflow-hidden rounded-2xl bg-surface shadow-card-lg"
        }
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
            {!editingTemplate && templateKey && (
              <button
                type="button"
                onClick={() => setEditingTemplate(true)}
                title="Открыть шаблон документа в редакторе и подправить текст. После сохранения превью обновится."
                className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-2 text-[12px] font-semibold text-muted-2 transition-colors hover:bg-blue-50 hover:text-blue-700"
              >
                <Pencil size={13} /> Подправить шаблон
              </button>
            )}
            {!editingTemplate && (
              <>
                <button
                  type="button"
                  onClick={() => setReloadKey(Date.now())}
                  title="Перегенерировать превью со свежими данными клиента/скутера"
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-2 text-[12px] font-semibold text-muted-2 transition-colors hover:bg-blue-50 hover:text-blue-700"
                >
                  <RefreshCw size={13} /> Обновить
                </button>
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
              </>
            )}
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
        {!editingTemplate && (
          <div className="border-b border-border bg-blue-50/60 px-5 py-2 text-[11px] text-blue-900">
            Чтобы сохранить <b>PDF</b> — нажмите «Печать» и в диалоге браузера
            выберите «Сохранить как PDF». Для <b>Word</b> используйте кнопку
            «Скачать Word» — файл можно открыть и подкорректировать в Microsoft
            Word.
          </div>
        )}

        {/* Контент: превью документа в iframe ИЛИ inline-редактор шаблона. */}
        {editingTemplate && templateKey ? (
          <div className="flex-1 overflow-y-auto bg-surface-soft p-4">
            <div className="mb-2 flex items-center gap-2 text-[12px] text-muted-2">
              <button
                type="button"
                onClick={() => {
                  setEditingTemplate(false);
                  // Перегенерируем превью со свежим override после правки.
                  setReloadKey(Date.now());
                }}
                className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 font-semibold text-ink-2 hover:bg-border"
              >
                <ArrowLeft size={12} /> Вернуться к превью
              </button>
              <span>
                Правки сохраняются автоматически (через 1.5 секунды).
                После «Вернуться» превью перерисуется свежей версией.
              </span>
            </div>
            <TemplateEditorPage
              templateKey={templateKey}
              templateName={templateName ?? title}
              onBack={() => {
                setEditingTemplate(false);
                setReloadKey(Date.now());
              }}
            />
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
