import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, RotateCcw, X } from "lucide-react";

/**
 * Своя камера в приложении (как у Instagram) — getUserMedia + MediaRecorder.
 *
 * Зачем: на iPhone кнопка `<input type=file capture>` пишет видео в ПОНИЖЕННОМ
 * качестве (программное ограничение iOS — подтверждено WebKit-багом #179994).
 * getUserMedia запрашивает высокое разрешение напрямую, MediaRecorder пишет в
 * один проход на высоком битрейте → на iOS это сразу H.264/MP4 (сервер потом
 * только ремуксит, без второго сжатия). Если камера/запись недоступны —
 * фолбэк на обычный `<input capture>` (onFallback).
 *
 * Ресёрч: constraints через `ideal`-диапазоны (НЕ `exact` — кидает
 * OverconstrainedError на iOS), битрейт 10–12 Мбит/с для резкого 1080p.
 */
function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function CameraCapture({
  onCapture,
  onClose,
  onFallback,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
  /** Камера недоступна → открыть обычную камеру телефона (input capture). */
  onFallback: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startStream = useCallback(async (mode: "environment" | "user") => {
    stopStream();
    setError(null);
    try {
      // ideal-диапазоны: запрашиваем 1080p задней камеры, но не падаем, если
      // устройство даёт меньше/больше.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: mode,
          width: { min: 640, ideal: 1920, max: 1920 },
          height: { min: 400, ideal: 1080 },
          frameRate: { ideal: 30 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setError(
        "Камера недоступна (нет разрешения или не поддерживается). Можно снять обычной камерой телефона.",
      );
    }
  }, []);

  useEffect(() => {
    void startStream(facing);
    return stopStream;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(t);
  }, [recording]);

  const pickMime = (): string => {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = [
      "video/mp4;codecs=h264",
      "video/mp4",
      "video/webm;codecs=h264",
      "video/webm;codecs=vp9",
      "video/webm",
    ];
    for (const m of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(m)) return m;
      } catch {
        /* пропускаем */
      }
    }
    return "";
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        videoBitsPerSecond: 12_000_000, // ~12 Мбит/с — резкий 1080p
      });
    } catch {
      try {
        rec = new MediaRecorder(stream);
      } catch {
        setError("Запись видео не поддерживается этим браузером.");
        return;
      }
    }
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const type = rec.mimeType || mime || "video/mp4";
      const blob = new Blob(chunksRef.current, { type });
      const ext = type.includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], `ущерб-видео-${chunksRef.current.length}.${ext}`, {
        type,
      });
      onCapture(file);
      onClose();
    };
    recRef.current = rec;
    setElapsed(0);
    // timeslice 1000 — стабильнее на iOS, чанки накапливаются.
    rec.start(1000);
    setRecording(true);
  };

  const stopRecording = () => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setRecording(false);
  };

  const takePhoto = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `ущерб-фото-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        onCapture(file);
        onClose();
      },
      "image/jpeg",
      0.95,
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Верхняя панель */}
      <div className="relative z-10 flex items-center justify-between px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <button
          type="button"
          onClick={() => {
            stopStream();
            onClose();
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white"
          aria-label="Закрыть"
        >
          <X size={20} />
        </button>
        {recording && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-[13px] font-semibold tabular-nums text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            {fmtTime(elapsed)}
          </span>
        )}
        {!recording && !error && (
          <button
            type="button"
            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white"
            aria-label="Сменить камеру"
          >
            <RotateCcw size={18} />
          </button>
        )}
        {(recording || error) && <span className="h-10 w-10" />}
      </div>

      {error && (
        <div className="relative z-10 mx-4 mt-2 rounded-2xl bg-black/60 px-4 py-4 text-center text-[13px] text-white/90">
          {error}
          <button
            type="button"
            onClick={() => {
              stopStream();
              onClose();
              onFallback();
            }}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-[14px] font-bold text-ink"
          >
            <Camera size={16} /> Обычная камера телефона
          </button>
        </div>
      )}

      {/* Нижние контролы */}
      {!error && (
        <div className="relative z-10 mt-auto flex items-center justify-around px-8 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-4">
          <button
            type="button"
            onClick={takePhoto}
            disabled={recording}
            className="flex h-12 w-16 items-center justify-center rounded-2xl bg-black/40 text-[12px] font-semibold text-white disabled:opacity-30"
          >
            Фото
          </button>

          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            aria-label={recording ? "Остановить запись" : "Снять видео"}
            className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/90 transition-transform active:scale-95"
          >
            <span
              className={
                recording
                  ? "h-7 w-7 rounded-md bg-red-500"
                  : "h-14 w-14 rounded-full bg-red-500"
              }
            />
          </button>

          {/* спейсер для симметрии с «Фото» */}
          <span className="h-12 w-16" />
        </div>
      )}
    </div>,
    document.body,
  );
}
