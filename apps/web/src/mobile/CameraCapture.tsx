import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Своя камера в приложении (как у Instagram) — getUserMedia + MediaRecorder.
 *
 * Зачем: на iPhone кнопка `<input type=file capture>` пишет видео в ПОНИЖЕННОМ
 * качестве (программное ограничение iOS — подтверждено WebKit-багом #179994).
 * getUserMedia запрашивает высокое разрешение напрямую, MediaRecorder пишет в
 * один проход → на iOS это сразу H.264/MP4 (сервер потом только ремуксит, без
 * второго сжатия). Если камера/запись недоступны — фолбэк на обычный
 * `<input capture>` (onFallback).
 *
 * Флоу как в телеге/инсте: снял фото или видео → СНАЧАЛА превью (можно
 * посмотреть, что получилось) → «Готово» прикрепляет, «Переснять» возвращает
 * к камере. Прикрепление (и фоновая загрузка) стартует только после «Готово».
 *
 * Ресёрч: constraints через `ideal`-диапазоны (НЕ `exact` — кидает
 * OverconstrainedError на iOS), битрейт ~8 Мбит/с — резкий 1080p при умеренном
 * размере файла (12 Мбит/с давал ~64 МБ за 40 сек → долгая загрузка с телефона).
 */
function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

type Captured = { file: File; url: string; kind: "photo" | "video" };

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
  // Снятый, но ещё НЕ подтверждённый кадр/видео — показываем превью.
  const [captured, setCaptured] = useState<Captured | null>(null);

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
        // ~8 Мбит/с — резкий 1080p при разумном размере (быстрая загрузка).
        videoBitsPerSecond: 8_000_000,
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
      const file = new File([blob], `ущерб-видео-${Date.now()}.${ext}`, {
        type,
      });
      // НЕ прикрепляем сразу — показываем превью для подтверждения (как фото).
      setCaptured({ file, url: URL.createObjectURL(blob), kind: "video" });
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
        // Сначала превью — подтвердить («Готово») или переснять.
        setCaptured({ file, url: URL.createObjectURL(blob), kind: "photo" });
      },
      "image/jpeg",
      0.95,
    );
  };

  // Превью снятого: переснять (вернуться к живой камере — поток ещё работает)
  // или подтвердить (прикрепить + закрыть).
  const retake = () => {
    if (captured) URL.revokeObjectURL(captured.url);
    setCaptured(null);
    setElapsed(0);
  };
  const useCaptured = () => {
    if (!captured) return;
    const f = captured.file;
    URL.revokeObjectURL(captured.url);
    setCaptured(null);
    stopStream();
    onCapture(f);
    onClose();
  };
  const closeAll = () => {
    if (captured) URL.revokeObjectURL(captured.url);
    stopStream();
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      {/* Живой поток камеры (прячем, пока показываем превью снятого). */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={cn(
          "absolute inset-0 h-full w-full object-cover",
          captured && "hidden",
        )}
      />

      {captured ? (
        /* ── Превью снятого: посмотреть → «Готово» или «Переснять» ── */
        <>
          {captured.kind === "video" ? (
            <video
              src={captured.url}
              controls
              autoPlay
              loop
              playsInline
              className="absolute inset-x-0 top-0 bottom-[5.75rem] bg-black object-contain"
            />
          ) : (
            <img
              src={captured.url}
              alt="Превью снимка"
              className="absolute inset-x-0 top-0 bottom-[5.75rem] bg-black object-contain"
            />
          )}
          <div className="relative z-10 flex items-center justify-between px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
            <button
              type="button"
              onClick={closeAll}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white"
              aria-label="Закрыть"
            >
              <X size={20} />
            </button>
            <span className="rounded-full bg-black/50 px-3 py-1 text-[13px] font-semibold text-white">
              {captured.kind === "video" ? "Проверьте видео" : "Проверьте снимок"}
            </span>
            <span className="h-10 w-10" />
          </div>
          <div className="relative z-10 mt-auto flex items-center gap-3 px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-4">
            <button
              type="button"
              onClick={retake}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-black/50 text-[14px] font-bold text-white ring-1 ring-inset ring-white/30 transition-transform active:scale-[0.98]"
            >
              <RotateCcw size={17} /> Переснять
            </button>
            <button
              type="button"
              onClick={useCaptured}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-white text-[14px] font-bold text-ink transition-transform active:scale-[0.98]"
            >
              <Check size={18} /> Готово
            </button>
          </div>
        </>
      ) : (
        /* ── Живая камера ── */
        <>
          <div className="relative z-10 flex items-center justify-between px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
            <button
              type="button"
              onClick={closeAll}
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
                onClick={() =>
                  setFacing((f) => (f === "environment" ? "user" : "environment"))
                }
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
        </>
      )}
    </div>,
    document.body,
  );
}
