import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/files";
import { confirmDialog, toast } from "@/lib/toast";
import { ImageCropDialog, type CropResult } from "@/components/ImageCropDialog";

/**
 * Универсальный загрузчик аватарки для каталогов (модели, экипировка).
 *
 * Поток:
 *  1. Пользователь выбирает файл (фильтр accept="image/*" — только картинки)
 *  2. Открывается ImageCropDialog с превью и зумом
 *  3. По «Сохранить» — на сервер уходят два blob'а: оригинал + thumbnail
 *  4. На стороне сервера оба сохраняются, в БД — avatarKey + avatarThumbKey
 *
 * В местах где аватарка маленькая (плитки/списки) показываем thumb
 * из avatarThumbKey, а в карточке/превью — оригинал.
 */
export function AvatarUpload({
  avatarKey,
  avatarThumbKey,
  onUpload,
  onRemove,
  uploading,
  removing,
  size = 80,
  cropAspect = 1,
  cropTitle = "Обрежьте аватарку",
}: {
  avatarKey: string | null | undefined;
  /** Опционально — миниатюра. Если есть, в превью используем её. */
  avatarThumbKey?: string | null;
  onUpload: (result: CropResult) => unknown | Promise<unknown>;
  onRemove?: () => unknown | Promise<unknown>;
  uploading?: boolean;
  removing?: boolean;
  size?: number;
  /** Соотношение кропа (1 = квадрат, 16/9 для обложек и т.п.). */
  cropAspect?: number;
  cropTitle?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Превью: предпочитаем миниатюру (быстрее), fallback на оригинал.
  const url = fileUrl(avatarThumbKey ?? avatarKey);

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) {
      toast.error("Файл слишком большой", "Максимум 25 МБ");
      return;
    }
    // Открываем диалог кропа — он сам сожмёт оригинал и сделает миниатюру.
    setPendingFile(f);
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            "relative shrink-0 overflow-hidden rounded-2xl border border-dashed transition-colors",
            url
              ? "border-border bg-surface-soft"
              : "border-border bg-surface-soft hover:border-blue-600 hover:bg-blue-50",
          )}
          style={{ width: size, height: size }}
          title={url ? "Заменить" : "Загрузить"}
        >
          {url ? (
            <img
              src={url}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-muted-2">
              <ImagePlus size={20} />
              <span className="text-[10px] font-semibold">фото</span>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />

        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-3 py-1.5 text-[12px] font-semibold text-ink-2 hover:bg-blue-50 hover:text-blue-700"
          >
            <ImagePlus size={12} /> {url ? "Заменить" : "Загрузить"}
          </button>
          {url && onRemove && (
            <button
              type="button"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: "Удалить аватарку?",
                  message: "Файл будет удалён. Можно будет загрузить новую.",
                  confirmText: "Удалить",
                  danger: true,
                });
                if (!ok) return;
                onRemove();
              }}
              disabled={removing}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-3 py-1.5 text-[12px] font-semibold text-muted-2 hover:bg-red-soft hover:text-red-ink"
            >
              {removing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Trash2 size={12} />
              )}
              Удалить
            </button>
          )}
          <div className="text-[10px] text-muted-2">JPG/PNG/WEBP/HEIC</div>
        </div>
      </div>

      <ImageCropDialog
        file={pendingFile}
        aspect={cropAspect}
        title={cropTitle}
        onClose={() => setPendingFile(null)}
        onSave={async (result) => {
          await onUpload(result);
        }}
      />
    </>
  );
}
