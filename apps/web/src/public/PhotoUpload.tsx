import { useEffect, useRef, useState } from "react";
import { Camera, Check, RotateCw, X } from "lucide-react";
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
  label: string;
  hint?: string;
  required: boolean;
  uploaded: boolean;
  onUploaded: () => void;
  onRemoved: () => void;
};

export function PhotoUpload(props: Props) {
  const { applicationId, uploadToken, kind, label, hint, required, uploaded } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Освобождаем blob-URL при размонтировании
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const pickFile = () => {
    if (busy) return;
    inputRef.current?.click();
  };

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

    // Превью только для image/* — для PDF и HEIC браузер всё равно не покажет.
    if (file.type.startsWith("image/") && file.type !== "image/heic" && file.type !== "image/heif") {
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
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 415) setError("Этот формат не поддерживается");
        else if (e.status === 401) setError("Сессия истекла, обновите страницу");
        else if (e.status === 429) setError("Слишком много загрузок, подождите");
        else setError("Не удалось загрузить");
      } else {
        setError("Проверьте интернет-соединение");
      }
    } finally {
      setBusy(false);
    }
  };

  const replace = () => {
    setError(null);
    pickFile();
  };

  const remove = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await applicationApi.deleteFile(applicationId, uploadToken, kind);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      props.onRemoved();
    } catch {
      setError("Не удалось удалить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[15px] font-semibold text-slate-900">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </div>
        {uploaded && (
          <div className="flex items-center gap-1 text-[12px] font-semibold text-green-600">
            <Check size={14} /> загружено
          </div>
        )}
      </div>
      {hint && <div className="mt-1 text-[13px] text-slate-500">{hint}</div>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/heic,image/heif,application/pdf"
        capture={kind === "selfie" ? "user" : "environment"}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onFile(file);
        }}
      />

      {!uploaded && (
        <button
          type="button"
          onClick={pickFile}
          disabled={busy}
          className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-[14px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
        >
          <Camera size={18} />
          {busy ? "Загружаем…" : "Сделать фото или выбрать файл"}
        </button>
      )}

      {uploaded && (
        <div className="mt-3 space-y-2">
          {previewUrl && (
            <img
              src={previewUrl}
              alt={label}
              className="h-40 w-full rounded-xl object-cover"
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={replace}
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RotateCw size={14} /> Заменить
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <X size={14} /> Удалить
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
