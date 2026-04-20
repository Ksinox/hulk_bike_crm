import { useEffect, useMemo, useState } from "react";
import { FileImage, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UploadedFile } from "./DocUpload";

type Pending = {
  raw: UploadedFile;
  title: string;
  comment: string;
};

function toPending(list: UploadedFile[]): Pending[] {
  return list.map((f) => ({ raw: f, title: "", comment: "" }));
}

export function SequentialNamingModal({
  files,
  onComplete,
  onCancel,
}: {
  files: UploadedFile[];
  onComplete: (named: UploadedFile[]) => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<Pending[]>(() => toPending(files));
  const [idx, setIdx] = useState(0);
  const [closing, setClosing] = useState(false);

  const cur = items[idx];
  const isLast = idx === items.length - 1;
  const progress = useMemo(
    () => Math.round(((idx + 1) / items.length) * 100),
    [idx, items.length],
  );

  const requestClose = (cb: () => void) => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(cb, 160);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose(onCancel);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (upd: Partial<Pending>) => {
    setItems((prev) =>
      prev.map((x, i) => (i === idx ? { ...x, ...upd } : x)),
    );
  };

  const finish = () => {
    const named: UploadedFile[] = items.map((it) => ({
      ...it.raw,
      title: it.title.trim() || it.raw.name,
      comment: it.comment.trim() || undefined,
    }));
    requestClose(() => onComplete(named));
  };

  const next = () => {
    if (isLast) finish();
    else setIdx(idx + 1);
  };

  const prev = () => {
    if (idx > 0) setIdx(idx - 1);
  };

  if (!cur) return null;

  const isImg =
    !!cur.raw.thumbUrl &&
    /\.(jpe?g|png|webp|gif)$/i.test(cur.raw.name);

  return (
    <div
      className={cn(
        "fixed inset-0 z-[200] flex items-center justify-center bg-ink/60 p-6 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
      onClick={() => requestClose(onCancel)}
    >
      <div
        className={cn(
          "flex w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-ink">
              Назовите документ{" "}
              <span className="text-muted-2">
                {idx + 1} из {items.length}
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => requestClose(onCancel)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-border hover:text-ink"
            title="Отменить"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="flex items-center gap-3 rounded-[12px] bg-surface-soft p-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-blue-50 text-blue-700">
              {cur.raw.thumbUrl && isImg ? (
                <img
                  src={cur.raw.thumbUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : isImg ? (
                <FileImage size={22} />
              ) : (
                <FileText size={22} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-ink">
                {cur.raw.name}
              </div>
              <div className="text-[11px] text-muted-2">
                Заполните поля — название поможет найти документ потом
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="sn-title"
              className="mb-1 block text-[12px] font-semibold text-ink"
            >
              Название
            </label>
            <input
              id="sn-title"
              type="text"
              value={cur.title}
              placeholder="Например: Акт приёма от 18.04"
              autoFocus
              onChange={(e) => patch({ title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  next();
                }
              }}
              className="h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-muted-2 focus:border-blue-600"
            />
            <div className="mt-1 text-[11px] text-muted-2">
              Если оставить пустым, будет использовано имя файла
            </div>
          </div>

          <div>
            <label
              htmlFor="sn-comment"
              className="mb-1 block text-[12px] font-semibold text-ink"
            >
              Комментарий{" "}
              <span className="text-muted-2">(необязательно)</span>
            </label>
            <textarea
              id="sn-comment"
              value={cur.comment}
              placeholder="Для чего загружен этот файл — чтобы не забыть через пару месяцев"
              rows={3}
              onChange={(e) => patch({ comment: e.target.value })}
              className="w-full resize-y rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] text-ink outline-none placeholder:text-muted-2 focus:border-blue-600"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-soft px-5 py-3">
          <button
            type="button"
            onClick={() => requestClose(onCancel)}
            className="rounded-full border border-border bg-surface px-4 py-1.5 text-[12px] font-semibold text-muted hover:bg-border"
          >
            Отменить загрузку
          </button>
          <div className="flex items-center gap-2">
            {idx > 0 && (
              <button
                type="button"
                onClick={prev}
                className="rounded-full border border-border bg-surface px-4 py-1.5 text-[12px] font-semibold text-ink hover:bg-border"
              >
                ← Назад
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="rounded-full bg-blue-600 px-4 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-blue-700"
            >
              {isLast ? "Сохранить всё" : "Далее →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
