import { useRef, useState } from "react";
import { Crop, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/files";
import { toast } from "@/lib/toast";
import { deleteFileWithUndo } from "@/lib/deleteFileWithUndo";
import {
  ImageCropDialog,
  type CropMeta,
  type CropPreviewKind,
  type CropResult,
} from "@/components/ImageCropDialog";

/**
 * Универсальный загрузчик аватарки для каталогов (модели, экипировка).
 *
 * Поток:
 *  1. Пользователь выбирает файл (фильтр accept="image/*" — только картинки)
 *  2. Открывается ImageCropDialog с превью и зумом
 *  3. По «Сохранить» — на сервер уходят кадр, миниатюра, исходник и параметры кадра
 *  4. На стороне сервера всё сохраняется, в БД — avatarKey + avatarThumbKey +
 *     avatarOriginalKey + avatarCrop
 *
 * Правка 06.09: кнопка «Перекадрировать» — открывает сохранённый исходник в
 * той же рамке, где её оставили. Файл на компьютере для этого не нужен.
 */
export function AvatarUpload({
  avatarKey,
  avatarThumbKey,
  originalKey,
  crop,
  onUpload,
  onRemove,
  uploading,
  removing,
  size = 80,
  cropAspect = 1,
  cropTitle = "Обрежьте аватарку",
  guide = false,
  previews,
  previewName,
}: {
  avatarKey: string | null | undefined;
  /** Опционально — миниатюра. Если есть, в превью используем её. */
  avatarThumbKey?: string | null;
  /** Исходник до кропа — по нему работает «Перекадрировать». */
  originalKey?: string | null;
  /** Параметры прошлого кадра — чтобы открыть рамку там же. */
  crop?: CropMeta | null;
  onUpload: (result: CropResult) => unknown | Promise<unknown>;
  onRemove?: () => unknown | Promise<unknown>;
  uploading?: boolean;
  removing?: boolean;
  size?: number;
  /** Соотношение кропа (1 = квадрат, 16/9 для обложек и т.п.). */
  cropAspect?: number;
  cropTitle?: string;
  /** Рамка-ориентир в кропе (для техники). */
  guide?: boolean;
  /** Живое превью карточек в кропе. */
  previews?: CropPreviewKind[];
  previewName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  /** Кадрируем сохранённый исходник (а не только что выбранный файл). */
  const [reCrop, setReCrop] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  // Во время окна отмены прячем аватарку из превью (как будто уже удалена).
  const [optimisticallyRemoved, setOptimisticallyRemoved] = useState(false);

  // Превью: предпочитаем ручную кропнутую миниатюру (avatarThumbKey),
  // fallback на оригинал. В обоих случаях просим у API thumb-вариант
  // (sharp-уменьшенный ~30 КБ) — даже если фолбэкнулись на avatarKey,
  // он не будет тянуться полным размером.
  const baseUrl = fileUrl(avatarThumbKey ?? avatarKey, { variant: "thumb" });
  // null во время окна отмены → превью показывает плейсхолдер «нет фото».
  const url = optimisticallyRemoved ? null : baseUrl;

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) {
      toast.error("Файл слишком большой", "Максимум 25 МБ");
      return;
    }
    // Открываем диалог кропа — он сам сожмёт оригинал и сделает миниатюру.
    setReCrop(false);
    setPendingFile(f);
  };

  /**
   * «Перекадрировать»: тянем сохранённый исходник с сервера и открываем тот
   * же диалог. Если исходника нет (аватарку загрузили до этой правки),
   * работаем по уже кадрированной картинке — подвинуть кадр внутри неё можно,
   * вернуть отрезанное — нет, поэтому честно предупреждаем.
   */
  const startReCrop = async () => {
    const key = originalKey || avatarKey;
    if (!key) return;
    setLoadingSource(true);
    try {
      const src = fileUrl(key);
      if (!src) return;
      const res = await fetch(src, { credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const name = key.split("/").pop() || "avatar";
      setReCrop(true);
      setPendingFile(new File([blob], name, { type: blob.type || "image/webp" }));
      if (!originalKey) {
        toast.info(
          "Исходник не сохранён",
          "Эту аватарку загрузили раньше — кадрируем то, что есть. Чтобы вернуть обрезанные края, загрузите фото заново.",
        );
      }
    } catch {
      toast.error("Не удалось открыть исходник", "Попробуйте загрузить фото заново");
    } finally {
      setLoadingSource(false);
    }
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
              ? "border-border bg-white"
              : "border-border bg-surface-soft hover:border-blue-600 hover:bg-blue-50",
          )}
          style={{ width: size, height: size }}
          title={url ? "Заменить" : "Загрузить"}
        >
          {url ? (
            <img
              src={url}
              alt=""
              className="h-full w-full object-contain"
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
          {url && (
            <button
              type="button"
              onClick={() => void startReCrop()}
              disabled={uploading || loadingSource}
              title="Подвинуть рамку у уже загруженного фото — файл заново искать не нужно"
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-[12px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              {loadingSource ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Crop size={12} />
              )}
              Перекадрировать
            </button>
          )}
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
              onClick={() =>
                void deleteFileWithUndo({
                  what: "аватарку",
                  onRemove: () => setOptimisticallyRemoved(true),
                  onRestore: () => setOptimisticallyRemoved(false),
                  onCommit: async () => {
                    await onRemove();
                    setOptimisticallyRemoved(false);
                  },
                })
              }
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
        format="webp"
        reCrop={reCrop}
        initialMeta={reCrop ? crop ?? null : null}
        guide={guide}
        previews={previews}
        previewName={previewName}
        onClose={() => {
          setPendingFile(null);
          setReCrop(false);
        }}
        onSave={async (result) => {
          await onUpload(result);
        }}
      />
    </>
  );
}
