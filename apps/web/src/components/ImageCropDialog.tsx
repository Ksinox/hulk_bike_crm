import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import {
  Check,
  Crosshair,
  FlipHorizontal2,
  Loader2,
  RotateCw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  prepareOriginal,
  renderCroppedImage,
  type CropArea,
} from "@/lib/imageCrop";

/**
 * Диалог кропа аватарки. Принимает выбранный файл (или ранее сохранённый
 * исходник — тогда это «Перекадрировать»), показывает drag/zoom и отдаёт:
 *  - full: закропанная область, ужатая до fullSize, WebP/JPEG
 *  - thumb: та же область, ужатая до thumbSize
 *  - original: исходник до кропа (ужат до 2048) — чтобы кадр можно было
 *    поправить позже без файла на руках
 *  - meta: параметры кадра (зум, сдвиг, поворот, отзеркаливание)
 *
 * Правки 06.09:
 *  • поворот теперь ПОПАДАЕТ в файл (раньше был виден только в диалоге);
 *  • отзеркаливание по горизонтали — чтобы вся техника смотрела в одну сторону;
 *  • рамка-ориентир: зеркала к верхней линии, колёса к нижней;
 *  • живое превью «как будет в карточке» вместо тёмного фона.
 */

export type CropMeta = {
  crop: { x: number; y: number };
  zoom: number;
  rotation: number;
  flipped: boolean;
  aspect?: number;
  /**
   * Кадр в процентах от картинки. Именно по нему восстанавливаем рамку при
   * «Перекадрировать»: сдвиг crop.x/y живёт в пикселях окна и на другом
   * экране (или в другом размере диалога) встал бы не туда.
   */
  areaPct?: { x: number; y: number; width: number; height: number };
};

export type CropResult = {
  full: Blob;
  thumb: Blob;
  /** Исходник до кропа. Не передаём, если кадрируем уже сохранённый исходник. */
  original?: Blob;
  meta: CropMeta;
};

/** Какие карточки показывать в живом превью. */
export type CropPreviewKind = "model" | "application" | "rental";

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
  /** Формат экспорта: 'webp' сохраняет прозрачность, 'jpeg' — для фото людей. */
  format?: "jpeg" | "webp";
  /** Кадрируем уже сохранённый исходник — новый оригинал слать не нужно. */
  reCrop?: boolean;
  /** С чего начать: сохранённые параметры прошлого кадра. */
  initialMeta?: CropMeta | null;
  /** Рамка-ориентир внутри кадра (для техники). */
  guide?: boolean;
  /** Живое превью «как будет выглядеть». */
  previews?: CropPreviewKind[];
  /** Подпись под превью — название модели. */
  previewName?: string;
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
/** Отступ рамки-ориентира от краёв кадра. */
const GUIDE_INSET_X = 0.06;
const GUIDE_INSET_Y = 0.08;

export function ImageCropDialog({
  file,
  aspect = 1,
  fullSize = 800,
  thumbSize = 512,
  onClose,
  onSave,
  title = "Обрежьте фото",
  format = "jpeg",
  reCrop = false,
  initialMeta = null,
  guide = false,
  previews,
  previewName,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [croppedArea, setCroppedArea] = useState<CropArea | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Открыли диалог — встаём туда, где кадр оставили в прошлый раз.
  const fileId = file ? `${file.name}:${file.size}:${file.lastModified}` : null;
  useEffect(() => {
    if (!fileId) return;
    // Позицию и зум восстанавливает сам кроппер по areaPct; руками ставим
    // только когда процентов нет (аватарки до этой правки).
    if (!initialMeta?.areaPct) {
      setCrop(initialMeta?.crop ?? { x: 0, y: 0 });
      setZoom(initialMeta?.zoom ?? 1);
    }
    setRotation(initialMeta?.rotation ?? 0);
    setFlipped(initialMeta?.flipped ?? false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  // ObjectURL держим ровно на время жизни файла — раньше он пересоздавался
  // на каждый рендер и утекал.
  const fileUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fileId],
  );
  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  const recenter = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  }, []);

  const areaPctRef = useRef<Area | null>(null);
  const onCropComplete = useCallback((areaPct: Area, areaPixels: Area) => {
    areaPctRef.current = areaPct;
    setCroppedArea({
      x: areaPixels.x,
      y: areaPixels.y,
      width: areaPixels.width,
      height: areaPixels.height,
    });
  }, []);

  // Живое превью карточек: пересобираем кадр с задержкой, чтобы не грузить
  // браузер на каждое движение мышью.
  const showPreviews = !!previews?.length;
  useEffect(() => {
    if (!showPreviews || !file || !croppedArea) return;
    let cancelled = false;
    let url: string | null = null;
    const t = window.setTimeout(async () => {
      try {
        const blob = await renderCroppedImage(file, croppedArea, {
          targetSize: 420,
          quality: 0.82,
          format,
          rotation,
          flip: flipped,
        });
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch {
        /* превью не критично */
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [croppedArea, rotation, flipped, showPreviews, fileId]);

  useEffect(() => {
    return () => {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  const handleSave = async () => {
    if (!file || !croppedArea) return;
    setError(null);
    setBusy(true);
    try {
      const pct = areaPctRef.current;
      const meta: CropMeta = {
        crop,
        zoom,
        rotation,
        flipped,
        aspect,
        areaPct: pct
          ? { x: pct.x, y: pct.y, width: pct.width, height: pct.height }
          : undefined,
      };
      const [full, thumb, original] = await Promise.all([
        renderCroppedImage(file, croppedArea, {
          targetSize: fullSize,
          quality: 0.9,
          format,
          rotation,
          flip: flipped,
        }),
        renderCroppedImage(file, croppedArea, {
          targetSize: thumbSize,
          quality: 0.85,
          format,
          rotation,
          flip: flipped,
        }),
        // При перекадрировании исходник уже лежит на сервере — не гоняем.
        reCrop ? Promise.resolve(undefined) : prepareOriginal(file),
      ]);
      await onSave({ full, thumb, original, meta });
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
        className={cn(
          "flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl",
          showPreviews ? "max-w-4xl" : "max-w-xl",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border bg-surface-soft px-5 py-3">
          <div className="min-w-0">
            <div className="truncate text-[16px] font-bold text-ink">{title}</div>
            <div className="text-[12px] text-muted">
              {guide
                ? "Впишите технику в рамку: зеркала — к верхней линии, колёса — к нижней."
                : "Перетаскивайте и зумируйте — миниатюра сохранится в этой рамке."}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row">
          {/* Кроппер */}
          <div className="relative min-h-[300px] flex-1 bg-ink lg:min-h-[420px]">
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
              initialCroppedAreaPercentages={
                initialMeta?.areaPct
                  ? {
                      x: initialMeta.areaPct.x,
                      y: initialMeta.areaPct.y,
                      width: initialMeta.areaPct.width,
                      height: initialMeta.areaPct.height,
                    }
                  : undefined
              }
              cropShape="rect"
              showGrid={false}
              objectFit="contain"
              classes={{ cropAreaClassName: "hb-crop-area" }}
              // Отзеркаливание живёт в самом трансформе — оператор сразу
              // видит, в какую сторону будет смотреть техника.
              transform={`translate(${crop.x}px, ${crop.y}px) rotate(${rotation}deg) scale(${zoom}) scaleX(${flipped ? -1 : 1})`}
            />
            {guide && <CropGuide aspect={aspect} />}
          </div>

          {/* Превью «как будет выглядеть» */}
          {showPreviews && (
            <aside className="flex shrink-0 flex-col gap-3 border-t border-border bg-surface-soft p-4 lg:w-[286px] lg:border-l lg:border-t-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                Как будет выглядеть
              </div>
              <div className="flex flex-row flex-wrap items-start gap-3 lg:flex-col lg:flex-nowrap">
                {previews!.includes("model") && (
                  <PreviewBox label="Карточка модели">
                    <div className="w-[168px] overflow-hidden rounded-xl border border-border bg-white shadow-card-sm">
                      <div className="relative aspect-[4/3] overflow-hidden bg-white">
                        {previewUrl && (
                          <img
                            src={previewUrl}
                            alt=""
                            className="absolute inset-0 h-full w-full object-contain p-2"
                            style={{ transform: "translateY(-6%) scale(1.18)" }}
                          />
                        )}
                      </div>
                      <div className="px-2.5 pb-2 pt-1.5">
                        <div className="truncate text-[12px] font-bold text-ink">
                          {previewName || "Модель"}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-2">
                          1–2 дн · 3–6 дн · 7–29 дн · 30+ дн
                        </div>
                      </div>
                    </div>
                  </PreviewBox>
                )}
                {previews!.includes("application") && (
                  <PreviewBox label="Выбор модели в анкете">
                    <div className="w-[124px] overflow-hidden rounded-[18px] border-2 border-border bg-white shadow-card-sm">
                      <div className="relative aspect-[4/5] w-full bg-gradient-to-b from-slate-100 to-slate-300">
                        {previewUrl && (
                          <img
                            src={previewUrl}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="truncate px-2 py-1.5 text-center text-[11px] font-bold text-ink">
                        {previewName || "Модель"}
                      </div>
                    </div>
                  </PreviewBox>
                )}
                {previews!.includes("rental") && (
                  <PreviewBox label="Блок «Скутер» в аренде">
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-white p-2 shadow-card-sm">
                      <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-white">
                        {previewUrl && (
                          <img
                            src={previewUrl}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-bold text-ink">
                          {previewName || "Модель"}
                        </div>
                        <div className="text-[10px] text-muted-2">Пробег 0 км</div>
                      </div>
                    </div>
                  </PreviewBox>
                )}
              </div>
              <div className="text-[11px] leading-snug text-muted-2">
                В анкете карточка выше и уже — по краям кадр подрезается.
                Проверьте, что техника не упирается в края.
              </div>
            </aside>
          )}
        </div>

        {/* Зум + инструменты */}
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
            <ToolButton
              onClick={recenter}
              disabled={busy}
              title="Отцентровать (сбросить зум, сдвиг и поворот)"
            >
              <Crosshair size={14} />
            </ToolButton>
            <ToolButton
              onClick={() => setRotation((r) => (r + 90) % 360)}
              disabled={busy}
              title="Повернуть на 90°"
            >
              <RotateCw size={14} />
            </ToolButton>
            <ToolButton
              onClick={() => setFlipped((v) => !v)}
              disabled={busy}
              active={flipped}
              title="Отзеркалить по горизонтали — чтобы техника смотрела в ту же сторону, что и остальная"
            >
              <FlipHorizontal2 size={14} />
            </ToolButton>
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

function ToolButton({
  onClick,
  disabled,
  title,
  active,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50",
        active ? "bg-blue-600 text-white" : "bg-white text-ink hover:bg-border",
      )}
    >
      {children}
    </button>
  );
}

function PreviewBox({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10.5px] font-semibold text-muted-2">{label}</div>
      {children}
    </div>
  );
}

/**
 * Рамка-ориентир поверх кадра (06.09). Менеджеру не надо «на глаз»
 * подбирать крупность: вписал технику в рамку — карточки получаются
 * одинаковыми. Считаем прямоугольник кадра сами: react-easy-crop вписывает
 * его в контейнер по заданному соотношению сторон.
 */
function CropGuide({ aspect }: { aspect: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      const w = Math.min(width, height * aspect);
      setBox({ w, h: w / aspect });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0">
      {box && (
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: box.w, height: box.h }}
        >
          <div
            className="absolute rounded-[10px] border-2 border-dashed border-white/70"
            style={{
              left: `${GUIDE_INSET_X * 100}%`,
              right: `${GUIDE_INSET_X * 100}%`,
              top: `${GUIDE_INSET_Y * 100}%`,
              bottom: `${GUIDE_INSET_Y * 100}%`,
            }}
          >
            <span className="absolute -top-[18px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/85 px-2 py-[1px] text-[10px] font-bold text-ink">
              зеркала и руль — сюда
            </span>
            <span className="absolute -bottom-[18px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/85 px-2 py-[1px] text-[10px] font-bold text-ink">
              колёса и подножка — сюда
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
