/**
 * Утилиты для кропа/ресайза изображений на клиенте.
 * Работает через Canvas — без зависимости от сервера, как у TinyPNG.
 *
 * Использование:
 *   const full = await cropImageToJpeg(file, area, 1024, 0.9);
 *   const thumb = await cropImageToJpeg(file, area, 256, 0.85);
 *   // оба отправляются на сервер вместе с оригиналом
 */

import imageCompression from "browser-image-compression";

export type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Загружает File/Blob в HTMLImageElement через ObjectURL. */
async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image load failed"));
      img.src = url;
    });
  } finally {
    // картинка уже декодирована, URL можно освободить
    URL.revokeObjectURL(url);
  }
}

/** Lazy-конвертация HEIC/HEIF → JPEG. */
async function maybeConvertHeic(file: File | Blob): Promise<File | Blob> {
  const name = file instanceof File ? file.name.toLowerCase() : "";
  const isHeic =
    /\.(heic|heif)$/i.test(name) ||
    file.type === "image/heic" ||
    file.type === "image/heif";
  if (!isHeic) return file;
  const { default: heic2any } = await import("heic2any");
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.85,
  });
  const blob = Array.isArray(result) ? result[0] : result;
  const newName =
    file instanceof File
      ? file.name.replace(/\.(heic|heif)$/i, ".jpg")
      : "image.jpg";
  return new File([blob], newName, { type: "image/jpeg" });
}

/**
 * Кропает изображение по area (в пикселях оригинала) и масштабирует
 * длинную сторону до targetSize.
 *
 * @param input файл/blob (включая HEIC — будет автоконвертирован)
 * @param area результат от react-easy-crop (croppedAreaPixels)
 * @param targetSize длинная сторона результата в px
 * @param quality качество 0..1
 * @param format v0.7.7: 'webp' — сохраняет прозрачность (предметы:
 *        скутеры/экипировка/модели), фон под предметом просвечивает
 *        на любой теме. 'jpeg' — для фото людей/документов (нет
 *        альфы, компактнее) с белой заливкой фона.
 */
export async function cropImageToBlob(
  input: File | Blob,
  area: CropArea,
  targetSize: number,
  quality = 0.85,
  format: "jpeg" | "webp" = "jpeg",
): Promise<Blob> {
  const normalized = await maybeConvertHeic(input);
  const img = await loadImage(normalized);

  // Длинная сторона кропа → targetSize, короткая пропорционально.
  const scale = targetSize / Math.max(area.width, area.height);
  const outW = Math.round(area.width * scale);
  const outH = Math.round(area.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d ctx");
  // JPEG не умеет альфа — заливаем белым, чтобы прозрачность не стала
  // чёрной. WebP умеет альфа — НЕ заливаем, сохраняем прозрачность
  // (предмет ляжет на подложку любой темы).
  if (format === "jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
  }
  // Рисуем именно вырезанный регион оригинала
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, outW, outH);

  const mime = format === "webp" ? "image/webp" : "image/jpeg";
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      mime,
      quality,
    );
  });
}

/**
 * Кроп с учётом поворота и отзеркаливания (06.09).
 *
 * react-easy-crop отдаёт croppedAreaPixels в системе координат ПОВЁРНУТОЙ
 * картинки, поэтому вырезать напрямую из оригинала нельзя: до правки поворот
 * в диалоге был виден оператору, но в файл не попадал. Порядок такой же, как
 * в примере библиотеки: рисуем повёрнутую (и при необходимости отзеркаленную)
 * картинку на холст по её описанному прямоугольнику, вырезаем область, потом
 * масштабируем до нужной стороны.
 */
export async function renderCroppedImage(
  input: File | Blob,
  area: CropArea,
  opts: {
    targetSize: number;
    quality?: number;
    format?: "jpeg" | "webp";
    /** Поворот в градусах (0/90/180/270). */
    rotation?: number;
    /** Отзеркалить по горизонтали. */
    flip?: boolean;
  },
): Promise<Blob> {
  const { targetSize, quality = 0.85, format = "jpeg", rotation = 0, flip = false } = opts;
  const normalized = await maybeConvertHeic(input);
  const img = await loadImage(normalized);

  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const boxW = img.width * cos + img.height * sin;
  const boxH = img.width * sin + img.height * cos;

  // 1. Повёрнутая/отзеркаленная картинка целиком.
  const stage = document.createElement("canvas");
  stage.width = Math.round(boxW);
  stage.height = Math.round(boxH);
  const sctx = stage.getContext("2d");
  if (!sctx) throw new Error("no 2d ctx");
  sctx.translate(boxW / 2, boxH / 2);
  sctx.rotate(rad);
  sctx.scale(flip ? -1 : 1, 1);
  sctx.translate(-img.width / 2, -img.height / 2);
  sctx.drawImage(img, 0, 0);

  // 2. Вырезаем область и масштабируем длинную сторону до targetSize.
  const scale = targetSize / Math.max(area.width, area.height);
  const outW = Math.max(1, Math.round(area.width * scale));
  const outH = Math.max(1, Math.round(area.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d ctx");
  if (format === "jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
  }
  ctx.drawImage(
    stage,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    outW,
    outH,
  );

  const mime = format === "webp" ? "image/webp" : "image/jpeg";
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      mime,
      quality,
    );
  });
}

/**
 * Исходник для будущего перекадрирования (06.09): ужимаем до 2048 по длинной
 * стороне, но БЕЗ кропа и без потери прозрачности — из него потом соберём
 * новый кадр, когда файла уже не будет под рукой.
 */
export async function prepareOriginal(input: File | Blob): Promise<Blob> {
  const normalized = await maybeConvertHeic(input);
  const img = await loadImage(normalized);
  const MAX = 2048;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const outW = Math.max(1, Math.round(img.width * scale));
  const outH = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d ctx");
  ctx.drawImage(img, 0, 0, outW, outH);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/webp",
      0.92,
    );
  });
}

/** @deprecated используйте cropImageToBlob. Оставлено для совместимости —
 *  всегда JPEG с белой заливкой. */
export async function cropImageToJpeg(
  input: File | Blob,
  area: CropArea,
  targetSize: number,
  quality = 0.85,
): Promise<Blob> {
  return cropImageToBlob(input, area, targetSize, quality, "jpeg");
}

/** Сжимает оригинал (без кропа) до разумного размера. Используется когда
 *  пользователь не хочет кропать или это не нужно (документы паспорта). */
export async function compressOriginal(file: File | Blob): Promise<Blob> {
  const normalized = await maybeConvertHeic(file);
  if (normalized.size <= 500 * 1024) return normalized;
  try {
    return await imageCompression(normalized as File, {
      maxSizeMB: 1.5,
      maxWidthOrHeight: 2048,
      useWebWorker: true,
      fileType: "image/jpeg",
      initialQuality: 0.85,
    });
  } catch {
    return normalized;
  }
}
