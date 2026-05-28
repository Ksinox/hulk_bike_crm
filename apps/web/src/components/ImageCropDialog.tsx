import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Check, Crosshair, Loader2, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { cropImageToBlob, type CropArea } from "@/lib/imageCrop";

/**
 * Диалог кропа аватарки. Принимает выбранный пользователем файл,
 * показывает интерфейс drag/zoom (как в Telegram/Slack при загрузке
 * фото профиля). По клику «Сохранить» возвращает два blob'а:
 *  - full: ЗАКРОПАННАЯ область, ужатая до fullSize (длинная сторона), JPEG
 *  - thumb: та же закропанная область, ужатая до thumbSize, JPEG
 *
 * v0.7.6: раньше `full` был оригиналом целиком (compressOriginal) — кроп
 * терялся, т.к. крупные превью (ModelCard, ScooterPosterAvatar) рендерят
 * именно avatarKey (full). Теперь ОБА blob'а вырезаны по одной области
 * croppedAreaPixels — то что оператор видит в рамке = то что сохраняется
 * и подтягивается везде.
 */

export type CropResult = {
  full: Blob;
  thumb: Blob;
};

type Props = {
  /** Исходный файл от пользователя (или null = диалог закрыт). */
  file: File | null;
  /** Соотношение сторон кропа. 1 = квадрат, 4/3 для постеров скутера/модели. */
  aspect?: number;
  /** Размер закропанного оригинала (длинная сторона), по умолчанию 800. */
  fullSize?: number;
  /** Размер итоговой миниатюры (длинная сторона), по умолчанию 512. */
  thumbSize?: number;
  onClose: () => void;
  onSave: (result: CropResult) => unknown | Promise<unknown>;
  /** Заголовок над кроппером. */
  title?: string;
  /** v0.7.7: формат экспорта. 'webp' — сохраняет прозрачность (предметы:
   *  скутеры/экипировка/модели). 'jpeg' (default) — фото людей/документы. */
  format?: "jpeg" | "webp";
};

export function ImageCropDialog({
  file,
  aspect = 1,
  fullSize = 800,
  thumbSize = 512,
  onClose,
  onSave,
  title = "Обрежьте фото",
  format = "jpeg",
}: Props) {
  // v0.7.4: разрешаем zoom-out (scale < 1). Раньше min был 1 и можно
  // было только увеличивать — кадр с краями не помещался.
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 3;
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  // «Отцентровать» — сброс позиции и зума в дефолт.
  const recenter = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }, []);
  const [croppedArea, setCroppedArea] = useState<CropArea | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileUrl = file ? URL.createObjectURL(file) : null;

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedArea({
      x: areaPixels.x,
      y: areaPixels.y,
      width: areaPixels.width,
      height: areaPixels.height,
    });
  }, []);

  const handleSave = async () => {
    if (!file || !croppedArea) return;
    setError(null);
    setBusy(true);
    try {
      // v0.7.6: оба blob'а вырезаны по croppedArea. full — крупнее (для
      // постера/карточки), thumb — мельче (для плиток/списков). Качество
      // выше для full, чтобы крупное превью не было замыленным.
      const [full, thumb] = await Promise.all([
        cropImageToBlob(file, croppedArea, fullSize, 0.9, format),
        cropImageToBlob(file, croppedArea, thumbSize, 0.85, format),
      ]);
      await onSave({ full, thumb });
      onClose();
    } catch {
      setError("Не удалось обработать изображение");
    } finally {
      setBusy(false);
    }
  };

  if (!file || !fileUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border bg-surface-soft px-5 py-3">
          <div>
            <div className="text-[16px] font-bold text-ink">{title}</div>
            <div className="text-[12px] text-muted">
              Перетаскивайте и зумируйте — миниатюра сохранится в этой рамке.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </header>

        {/* Кроппер */}
        <div className="relative h-[60vh] min-h-[320px] bg-ink">
          <Cropper
            image={fileUrl}
            crop={crop}
            zoom={zoom}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            rotation={rotation}
            aspect={aspect}
            restrictPosition={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
            cropShape="rect"
            showGrid={false}
            objectFit="contain"
          />
        </div>

        {/* Зум-слайдер + поворот */}
        <div className="border-t border-border bg-surface-soft px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-[11px] uppercase tracking-wide text-muted">
              Зум
            </span>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              disabled={busy}
              className="flex-1 accent-blue-600"
            />
            <button
              type="button"
              onClick={recenter}
              disabled={busy}
              title="Отцентровать (сбросить зум и позицию)"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-ink transition-colors hover:bg-border disabled:opacity-50"
            >
              <Crosshair size={14} />
            </button>
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              disabled={busy}
              title="Повернуть на 90°"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-ink transition-colors hover:bg-border disabled:opacity-50"
            >
              <RotateCw size={14} />
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 px-5 py-2 text-[13px] text-red-700">
            {error}
          </div>
        )}

        <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-border bg-white px-4 py-2 text-[13px] font-semibold text-ink hover:bg-surface-soft disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || !croppedArea}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2 text-[13px] font-semibold text-white",
              "disabled:opacity-50",
            )}
          >
            {busy ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Обрабатываем…
              </>
            ) : (
              <>
                <Check size={14} />
                Сохранить
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
