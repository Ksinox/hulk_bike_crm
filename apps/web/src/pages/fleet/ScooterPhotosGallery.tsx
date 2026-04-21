import { useMemo, useRef, useState } from "react";
import { Camera, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fileUrl,
  useApiScooterDocs,
  useDeleteScooterDoc,
  useUploadScooterDoc,
  type ApiScooterDoc,
} from "@/lib/api/documents";
import { FilePreviewModal } from "@/pages/clients/FilePreviewModal";

const MAX_PHOTOS = 10;

/**
 * Галерея фотографий скутера — до 10 штук.
 * Отдельно от модельной «аватарки» (та рисуется иконкой, тут — реальные фото).
 * Клик на фото → предпросмотр в модалке поверх CRM (не в новой вкладке).
 */
export function ScooterPhotosGallery({ scooterId }: { scooterId: number }) {
  const { data: docs = [] } = useApiScooterDocs(scooterId);
  const uploadMut = useUploadScooterDoc(scooterId);
  const deleteMut = useDeleteScooterDoc(scooterId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ApiScooterDoc | null>(null);

  const photos = useMemo(
    () => docs.filter((d) => d.kind === "photo"),
    [docs],
  );

  const limitReached = photos.length >= MAX_PHOTOS;

  const onPick = () => inputRef.current?.click();

  const onFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const remaining = MAX_PHOTOS - photos.length;
    const toUpload = Array.from(fileList).slice(0, Math.max(0, remaining));
    for (const f of toUpload) {
      uploadMut.mutate({ kind: "photo", file: f });
    }
  };

  const onDelete = (doc: ApiScooterDoc) => {
    if (!window.confirm(`Удалить фото «${doc.fileName}»?`)) return;
    deleteMut.mutate(doc.id);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
            Фото скутера
          </div>
          <span className="text-[11px] font-semibold text-muted-2">
            {photos.length}/{MAX_PHOTOS}
          </span>
        </div>
        <button
          type="button"
          onClick={onPick}
          disabled={limitReached || uploadMut.isPending}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
            limitReached || uploadMut.isPending
              ? "cursor-not-allowed bg-surface-soft text-muted-2"
              : "bg-blue-50 text-blue-700 hover:bg-blue-100",
          )}
          title={
            limitReached
              ? `Достигнут лимит — ${MAX_PHOTOS} фото на скутер`
              : "Загрузить фотографии"
          }
        >
          {uploadMut.isPending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Plus size={12} />
          )}
          Добавить
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          e.currentTarget.value = "";
        }}
      />

      {photos.length === 0 ? (
        <div
          onClick={onPick}
          className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[12px] border-2 border-dashed border-border bg-surface-soft/50 px-3 py-6 text-center transition-colors hover:border-blue-600/50 hover:bg-blue-50/40"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-700">
            <Camera size={16} />
          </div>
          <div className="text-[12px] font-semibold text-ink-2">
            Ни одного фото
          </div>
          <div className="text-[11px] leading-snug text-muted-2">
            Нажмите — до {MAX_PHOTOS} штук, JPG/PNG/WEBP
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
          {photos.map((p) => (
            <div
              key={p.id}
              className="group relative aspect-square overflow-hidden rounded-[12px] border border-border bg-surface-soft"
            >
              <button
                type="button"
                onClick={() => setPreview(p)}
                className="h-full w-full"
                title="Открыть"
              >
                <img
                  src={fileUrl(p.fileKey)}
                  alt={p.fileName}
                  className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                />
              </button>
              <button
                type="button"
                onClick={() => onDelete(p)}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-red-ink group-hover:opacity-100"
                title="Удалить"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {uploadMut.isError && (
        <div className="rounded-[10px] bg-red-soft/60 px-2.5 py-1.5 text-[11px] text-red-ink">
          Не удалось загрузить: {String(uploadMut.error)}
        </div>
      )}

      {preview && (
        <FilePreviewModal
          file={{
            name: preview.fileName,
            thumbUrl: fileUrl(preview.fileKey),
            size: preview.size,
          }}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
