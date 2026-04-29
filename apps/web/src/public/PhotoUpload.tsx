import { useEffect, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { Camera, Check, FolderOpen, RotateCw } from "lucide-react";
import { ApiError, applicationApi, type FileKind } from "./applicationApi";

/**
 * Фильтрация форматов — через атрибут `accept` на <input>: системный
 * picker просто не покажет PDF/MP3/EXE и т.п. Дополнительной валидации
 * с сообщением «не тот формат» в UI нет — она избыточна, картинку
 * иначе и не выберешь. Если каким-то образом не-image всё-таки дойдёт
 * до сервера — сервер ответит 415 и UI покажет общую ошибку загрузки.
 *
 * HEIC принимаем — конвертируем в JPEG локально через heic2any
 * (~2.4 MB lazy-chunk, грузится только если файл реально HEIC).
 */

/** Лимит на исходный файл (после ресайза/сжатия будет сильно меньше). */
const MAX_RAW_SIZE_MB = 25;

/**
 * Параметры сжатия. Цель — минимально потерять качество для
 * читабельности паспорта/прав, но не таскать в MinIO 5+ МБ снимки
 * с iPhone «как есть».
 */
const COMPRESSION_OPTIONS = {
  maxSizeMB: 1.5, // итоговый файл ≤ 1.5 МБ
  maxWidthOrHeight: 2048, // длинная сторона ≤ 2048px (читаемо для документов)
  useWebWorker: true,
  fileType: "image/jpeg" as const,
  initialQuality: 0.85,
};

/** Конвертация HEIC/HEIF в JPEG. Lazy import — пакет тяжёлый (2.4 МБ). */
async function maybeConvertHeic(file: File): Promise<File> {
  const isHeic =
    /\.(heic|heif)$/i.test(file.name) ||
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
  const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
  return new File([blob], newName, { type: "image/jpeg" });
}

type Props = {
  applicationId: number;
  uploadToken: string;
  kind: FileKind;
  /** Образец-иллюстрация: показывается сверху до загрузки. */
  sample: React.ReactNode;
  /** Заголовок шага. */
  title: string;
  /** Подсказка под заголовком. */
  hint: string;
  /** Состояние: загружено ли уже фото этого вида. */
  uploaded: boolean;
  /** environment — тыловая камера (документы), user — фронтальная (селфи). */
  cameraFacing: "user" | "environment";
  onUploaded: () => void;
  onRemoved: () => void;
  /** Вызывается после успешной загрузки — для auto-advance к следующему шагу. */
  onAdvance: () => void;
};

export function PhotoUpload(props: Props) {
  const {
    applicationId,
    uploadToken,
    kind,
    sample,
    title,
    hint,
    uploaded,
    cameraFacing,
  } = props;
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onFile = async (rawFile: File) => {
    setError(null);
    if (rawFile.size > MAX_RAW_SIZE_MB * 1024 * 1024) {
      setError(`Файл больше ${MAX_RAW_SIZE_MB} МБ — слишком тяжёлый`);
      return;
    }

    setBusy(true);
    try {
      // 1. HEIC/HEIF от iPhone → JPEG (через heic2any, lazy-chunk)
      let file = await maybeConvertHeic(rawFile);

      // 2. Сжатие+ресайз до ~2048px / 1.5 МБ. Пропускаем если файл уже
      //    маленький (не теряем качество впустую).
      if (file.size > 500 * 1024) {
        try {
          const compressed = await imageCompression(file, COMPRESSION_OPTIONS);
          // image-compression иногда возвращает Blob вместо File —
          // нормализуем чтобы FormData взял имя.
          file = new File(
            [compressed],
            file.name.replace(/\.(png|webp)$/i, ".jpg"),
            { type: compressed.type || "image/jpeg" },
          );
        } catch {
          // Если сжатие упало (битый файл, нехватка памяти на телефоне) —
          // льём оригинал. Лучше так чем не загрузить вообще.
        }
      }

      // 3. Превью
      const url = URL.createObjectURL(file);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });

      // 4. Аплоад
      await applicationApi.uploadFile(applicationId, uploadToken, kind, file);
      props.onUploaded();
      // Auto-advance — клиент идёт по форме «за руку», без лишних нажатий.
      window.setTimeout(() => props.onAdvance(), 600);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 415) setError("Этот формат не поддерживается");
        else if (e.status === 401)
          setError("Сессия истекла, обновите страницу");
        else if (e.status === 429)
          setError("Слишком много загрузок, подождите");
        else setError("Не удалось загрузить");
      } else {
        setError("Проверьте интернет-соединение");
      }
    } finally {
      setBusy(false);
    }
  };

  const replace = async () => {
    if (busy) return;
    setError(null);
    // Перезагрузить — удаляем текущий, потом откроем камеру.
    setBusy(true);
    try {
      await applicationApi.deleteFile(applicationId, uploadToken, kind);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      props.onRemoved();
      // даём React перерисоваться и сразу открываем камеру
      window.setTimeout(() => cameraInputRef.current?.click(), 50);
    } catch {
      setError("Не удалось перезагрузить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[22px] font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-[14px] text-slate-600">{hint}</p>
      </header>

      {/* Образец сверху до загрузки */}
      {!uploaded && (
        <div className="rounded-2xl bg-slate-100 p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Образец — ориентируйтесь по нему
          </div>
          <div className="flex items-center justify-center">{sample}</div>
        </div>
      )}

      {/* Превью после загрузки */}
      {uploaded && previewUrl && (
        <div className="overflow-hidden rounded-2xl bg-slate-100">
          <img
            src={previewUrl}
            alt={title}
            className="h-auto max-h-[60vh] w-full object-contain"
          />
        </div>
      )}

      {/* Скрытые input'ы — два разных, чтобы пользователь явно выбирал источник */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/heic,image/heif"
        capture={cameraFacing}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onFile(file);
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onFile(file);
        }}
      />

      {/* Кнопки */}
      {!uploaded && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={busy}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[15px] font-semibold text-white disabled:opacity-50"
          >
            <Camera size={20} />
            {busy ? "Обрабатываем фото…" : "Сфотографировать"}
          </button>
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={busy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-[14px] font-semibold text-slate-700 disabled:opacity-50"
          >
            <FolderOpen size={18} />
            Выбрать из галереи
          </button>
        </div>
      )}

      {uploaded && (
        <div className="rounded-xl bg-emerald-50 p-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-emerald-700">
            <Check size={16} />
            Загружено — переходим к следующему шагу
          </div>
          <button
            type="button"
            onClick={replace}
            disabled={busy}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            <RotateCw size={12} /> Переснять
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
