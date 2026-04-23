import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/files";

/**
 * Универсальный загрузчик аватарки для каталогов (модели, экипировка).
 * Принимает текущий avatarKey (может быть null) + колбэки загрузки/удаления.
 * Сам виджет stateless относительно данных — parent делает мутацию через хук.
 */
export function AvatarUpload({
  avatarKey,
  onUpload,
  onRemove,
  uploading,
  removing,
  size = 80,
}: {
  avatarKey: string | null | undefined;
  onUpload: (file: File) => unknown | Promise<unknown>;
  onRemove?: () => unknown | Promise<unknown>;
  uploading?: boolean;
  removing?: boolean;
  size?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const url = preview ?? fileUrl(avatarKey);

  const handleFile = async (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      alert("Нужна картинка (JPG / PNG / WEBP)");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      alert("Файл больше 5 МБ");
      return;
    }
    // локальный preview до ответа сервера
    const local = URL.createObjectURL(f);
    setPreview(local);
    try {
      await onUpload(f);
    } finally {
      URL.revokeObjectURL(local);
      setPreview(null);
    }
  };

  return (
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
        accept="image/jpeg,image/png,image/webp"
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
            onClick={() => {
              if (!confirm("Удалить аватарку?")) return;
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
        <div className="text-[10px] text-muted-2">JPG/PNG/WEBP, до 5 МБ</div>
      </div>
    </div>
  );
}
