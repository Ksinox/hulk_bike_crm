import { useEffect, useRef, useState } from "react";
import { Camera, Check, FolderOpen, RotateCw } from "lucide-react";
import { ApiError, applicationApi, type FileKind } from "./applicationApi";

const ALLOWED_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "application/pdf",
];

const MAX_SIZE_MB = 15;

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

  const onFile = async (file: File) => {
    setError(null);
    if (!ALLOWED_MIME.includes(file.type.toLowerCase())) {
      setError("Только JPEG, PNG, HEIC или PDF");
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Файл больше ${MAX_SIZE_MB} МБ`);
      return;
    }

    if (
      file.type.startsWith("image/") &&
      file.type !== "image/heic" &&
      file.type !== "image/heif"
    ) {
      const url = URL.createObjectURL(file);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } else {
      setPreviewUrl(null);
    }

    setBusy(true);
    try {
      await applicationApi.uploadFile(applicationId, uploadToken, kind, file);
      props.onUploaded();
      // Auto-advance — клиент идёт по форме «за руку», без лишних нажатий.
      // Небольшая задержка чтобы успел увидеть «загружено» и не было ощущения
      // что кнопка проскочила.
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
        accept="image/jpeg,image/jpg,image/png,image/heic,image/heif,application/pdf"
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
            {busy ? "Загружаем…" : "Сфотографировать"}
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
