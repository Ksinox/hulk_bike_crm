/**
 * Серверная обработка картинок: генерация уменьшенных вариантов
 * для миниатюр (thumb) и просмотра в попапах (view), плюс корректный
 * EXIF-rotate (фотки с iPhone приходят боком, без rotate они так и
 * хранятся «лёжа»).
 *
 * Формат вариантов — WebP. Выбор пал на WebP вместо JPEG/PNG:
 *   • поддерживает alpha-канал — прозрачные PNG (аватарки моделей
 *     на прозрачном фоне) сохраняют прозрачность. JPEG flatten'ил
 *     альфу в чёрный прямоугольник, PNG в разы тяжелее.
 *   • размер ≈25% меньше JPEG того же визуального качества (благодаря
 *     более продвинутому VP8L-кодеку), и в 3-4 раза меньше PNG.
 *   • поддержка во всех современных браузерах (Safari iOS 14+,
 *     Chrome/Firefox/Edge — давно, Yandex/Opera — давно).
 *
 * Контракт: функция принимает буфер исходной картинки, возвращает два
 * варианта (view / thumb) — оба WebP. Если входной mime не картинка —
 * возвращаем `null` и upload-роуты грузят оригинал как есть (PDF,
 * видео и т.п. не обрабатываются).
 *
 * Размеры:
 *   thumb:  max 400×400, WebP q78  — ~25 КБ для миниатюр в гриде
 *   view:   max 2000×2000, WebP q80 — ~250 КБ для попапа просмотра
 *   orig:   как есть — для скачивания и юр-целей
 *
 * Ключи в MinIO кладутся по конвенции:
 *   {basePath}/{uuid}.{ext}                ← orig (тот что был раньше)
 *   {basePath}/{uuid}.__view__.webp        ← view-вариант
 *   {basePath}/{uuid}.__thumb__.webp       ← thumb-вариант
 *
 * Так фронт-роут /api/files/{key}?variant=thumb просто подменяет ключ
 * на derived (см. files.ts) и берёт нужный вариант. Если variant-файл
 * не существует (legacy-загрузка до этого фикса) — fallback на orig.
 */
import sharp from "sharp";
import { putObject } from "./index.js";

const VIEW_MAX = 2000;
const THUMB_MAX = 400;

/** Mime-типы которые мы обрабатываем sharp'ом. PDF не трогаем. */
const PROCESSABLE = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic", // sharp на bookworm-slim умеет; на alpine — нет, кинет ошибку
  "image/heif",
]);

export function isProcessableImage(mimeType: string): boolean {
  return PROCESSABLE.has(mimeType.toLowerCase());
}

/**
 * Сгенерировать view+thumb из исходного буфера. Возвращает объект с
 * двумя буферами (оба JPEG/progressive) или null если не картинка
 * или sharp не смог распарсить вход (например, повреждённый файл —
 * оригинал в этом случае всё равно грузится).
 */
export async function generateImageVariants(
  buf: Buffer,
  mimeType: string,
): Promise<{ view: Buffer; thumb: Buffer } | null> {
  if (!isProcessableImage(mimeType)) return null;
  try {
    // .clone() — потому что sharp pipeline single-shot. Делаем общую
    // нормализацию (rotate по EXIF) один раз, дальше клонируем под два
    // варианта параллельно.
    //
    // Формат — WebP, lossy, без принудительного flatten. Если у входа
    // alpha-канал (PNG-аватарка скутера на прозрачном фоне) — alpha
    // сохраняется. effort=4 — золотая середина между скоростью и
    // компрессией (по бенчмаркам sharp).
    const base = sharp(buf, { failOn: "none" }).rotate();
    const [view, thumb] = await Promise.all([
      base
        .clone()
        .resize(VIEW_MAX, VIEW_MAX, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80, effort: 4 })
        .toBuffer(),
      base
        .clone()
        .resize(THUMB_MAX, THUMB_MAX, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 78, effort: 4 })
        .toBuffer(),
    ]);
    return { view, thumb };
  } catch (err) {
    // Битый/неподдерживаемый файл — лог + null. Оригинал всё равно
    // сохранится в putObject выше по флоу.
    // eslint-disable-next-line no-console
    console.warn("[image-variants] sharp failed for", mimeType, err);
    return null;
  }
}

/**
 * Преобразует ключ оригинала в ключ варианта.
 *   "clients/123/passport/abc.jpg" + "thumb"
 *     → "clients/123/passport/abc.__thumb__.webp"
 *
 * Маркер `__thumb__` / `__view__` ставится перед расширением. Расширение
 * всегда `.webp` (мы всегда сохраняем WebP — см. generateImageVariants).
 */
export function variantKey(
  origKey: string,
  variant: "view" | "thumb",
): string {
  const dot = origKey.lastIndexOf(".");
  if (dot < 0) return `${origKey}.__${variant}__.webp`;
  const base = origKey.slice(0, dot);
  return `${base}.__${variant}__.webp`;
}

/**
 * Положить оригинал + сгенерированные варианты в MinIO. Если файл
 * не картинка — кладёт только оригинал. Поверх обычного putObject —
 * НЕ ломает поведение для PDF/видео/и т.п.
 *
 * Используется во всех upload-роутах вместо прямого putObject(...).
 */
export async function putObjectWithImageVariants(
  key: string,
  buf: Buffer,
  mimeType: string,
): Promise<void> {
  // Оригинал кладём всегда первым — он критичен. Если sharp упадёт,
  // у нас хотя бы оригинал в хранилище.
  await putObject(key, buf, mimeType);

  const variants = await generateImageVariants(buf, mimeType);
  if (!variants) return;

  await Promise.all([
    putObject(variantKey(key, "view"), variants.view, "image/webp"),
    putObject(variantKey(key, "thumb"), variants.thumb, "image/webp"),
  ]);
}
