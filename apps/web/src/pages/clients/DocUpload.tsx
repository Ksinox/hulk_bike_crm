import { useRef, useState } from "react";
import { FileImage, FileText, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilePreviewModal } from "./FilePreviewModal";

export type UploadedFile = {
  name: string;
  size?: number;
  thumbUrl?: string;
  label?: string;
  existing?: boolean;
  title?: string;
  comment?: string;
};

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function isImageName(name: string): boolean {
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(name);
}

export function DocUpload({
  label,
  hint,
  accept = "image/*,application/pdf",
  file,
  onChange,
}: {
  label: string;
  hint?: string;
  accept?: string;
  file: UploadedFile | null;
  onChange: (next: UploadedFile | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const handleFile = (f: File) => {
    const uf: UploadedFile = { name: f.name, size: f.size };
    if (f.type.startsWith("image/") || f.type === "application/pdf") {
      uf.thumbUrl = URL.createObjectURL(f);
    }
    onChange(uf);
  };

  if (file) {
    const isImg = !!file.thumbUrl || isImageName(file.name);
    return (
      <>
        <div className="flex items-center gap-3 rounded-[12px] border border-border bg-surface px-3 py-2.5 transition-colors">
          <button
            type="button"
            onClick={() => setPreviewing(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-blue-50 text-blue-700 transition-transform hover:scale-[1.04]"
            title="Открыть предпросмотр"
          >
            {file.thumbUrl && isImg ? (
              <img
                src={file.thumbUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : isImg ? (
              <FileImage size={18} />
            ) : (
              <FileText size={18} />
            )}
          </button>
          <button
            type="button"
            onClick={() => setPreviewing(true)}
            className="min-w-0 flex-1 text-left"
          >
            <div className="truncate text-[12px] font-semibold text-ink hover:text-blue-600">
              {label}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-2">
              <span className="truncate">{file.name}</span>
              {file.size ? (
                <span className="shrink-0">· {formatSize(file.size)}</span>
              ) : file.existing ? (
                <span className="shrink-0 rounded-full bg-green-soft px-1.5 text-[10px] font-semibold text-green-ink">
                  уже загружено
                </span>
              ) : null}
            </div>
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-2 transition-colors hover:bg-red-soft hover:text-red-ink"
            title="Удалить"
          >
            <X size={14} />
          </button>
        </div>
        {previewing && (
          <FilePreviewModal
            file={{ ...file, title: file.title || label }}
            onClose={() => setPreviewing(false)}
          />
        )}
      </>
    );
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
      }}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-[12px] border border-dashed px-3 py-3 transition-colors",
        dragging
          ? "border-blue-600 bg-blue-50"
          : "border-border hover:border-blue-600 hover:bg-blue-50/40",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-surface-soft text-muted">
        <UploadCloud size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold text-ink">{label}</div>
        <div className="mt-0.5 text-[11px] text-muted-2">
          {hint || "Перетащите файл или нажмите чтобы выбрать"}
        </div>
      </div>
    </label>
  );
}

export function DocUploadMulti({
  label,
  hint,
  accept = "image/*,application/pdf",
  files,
  onChange,
}: {
  label: string;
  hint?: string;
  accept?: string;
  files: UploadedFile[];
  onChange: (next: UploadedFile[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  const addFiles = (list: FileList) => {
    const next: UploadedFile[] = [];
    for (const f of Array.from(list)) {
      const uf: UploadedFile = { name: f.name, size: f.size };
      if (f.type.startsWith("image/") || f.type === "application/pdf") {
        uf.thumbUrl = URL.createObjectURL(f);
      }
      next.push(uf);
    }
    onChange([...files, ...next]);
  };

  const patch = (i: number, upd: Partial<UploadedFile>) => {
    onChange(files.map((x, j) => (j === i ? { ...x, ...upd } : x)));
  };

  return (
    <div className="flex flex-col gap-2">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-[12px] border border-dashed px-3 py-3 transition-colors",
          dragging
            ? "border-blue-600 bg-blue-50"
            : "border-border hover:border-blue-600 hover:bg-blue-50/40",
        )}
      >
        <input
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-surface-soft text-muted">
          <UploadCloud size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-ink">{label}</div>
          <div className="mt-0.5 text-[11px] text-muted-2">
            {hint || "Можно несколько файлов"}
          </div>
        </div>
      </label>

      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          {files.map((f, i) => {
            const isImg = !!f.thumbUrl || isImageName(f.name);
            return (
              <div
                key={i}
                className="rounded-[12px] border border-border bg-surface p-2.5"
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewIdx(i)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-blue-50 text-blue-700 transition-transform hover:scale-[1.04]"
                    title="Открыть"
                  >
                    {f.thumbUrl && isImg ? (
                      <img
                        src={f.thumbUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : isImg ? (
                      <FileImage size={16} />
                    ) : (
                      <FileText size={16} />
                    )}
                  </button>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <input
                      type="text"
                      value={f.title ?? ""}
                      placeholder="Название документа (например: Акт приёма от 18.04)"
                      onChange={(e) =>
                        patch(i, { title: e.target.value })
                      }
                      className="h-8 w-full rounded-[8px] border border-border bg-surface-soft px-2 text-[12px] font-semibold text-ink outline-none placeholder:text-muted-2 focus:border-blue-600 focus:bg-surface"
                    />
                    <textarea
                      value={f.comment ?? ""}
                      placeholder="Комментарий — для чего загружен этот файл"
                      onChange={(e) =>
                        patch(i, { comment: e.target.value })
                      }
                      rows={2}
                      className="w-full resize-none rounded-[8px] border border-border bg-surface-soft px-2 py-1.5 text-[11px] text-ink outline-none placeholder:text-muted-2 focus:border-blue-600 focus:bg-surface"
                    />
                    <div className="truncate text-[10px] text-muted-2">
                      {f.name}
                      {f.size ? ` · ${formatSize(f.size)}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onChange(files.filter((_, j) => j !== i))}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-2 hover:bg-red-soft hover:text-red-ink"
                    title="Удалить"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {previewIdx != null && files[previewIdx] && (
        <FilePreviewModal
          file={files[previewIdx]}
          onClose={() => setPreviewIdx(null)}
        />
      )}
    </div>
  );
}
