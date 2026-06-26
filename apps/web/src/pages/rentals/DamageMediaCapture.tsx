import { useRef, useState } from "react";
import { Camera, Images, X, Play, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/files";
import type { ApiDamageMedia } from "@/lib/api/damage-reports";
import { MediaLightbox, type LightboxItem } from "@/components/MediaLightbox";
import { useIsMobile } from "@/lib/useIsMobile";
import { CameraCapture } from "@/mobile/CameraCapture";

/**
 * Захват фото/видео повреждений при приёмке по ущербу.
 *
 * Контролируемый презентационный компонент: родитель владеет состоянием
 * (staged — локально выбранные ещё не загруженные; uploaded — уже на сервере)
 * и оркестрирует загрузку. Здесь — только UI: две кнопки (камера/галерея) +
 * сетка миниатюр с удалением.
 *
 * На телефоне «Снять» (capture="environment") открывает камеру — фото ИЛИ
 * видео сразу. «Галерея» — мультивыбор из медиатеки. На десктопе capture
 * игнорируется → обычный файловый диалог.
 */

export type StagedMedia = {
  /** Локальный uid для key/удаления. */
  id: string;
  file: File;
  /** objectURL для превью. */
  previewUrl: string;
  kind: "photo" | "video";
  durationSec?: number;
  /** Кадр-постер видео (data URL), best-effort — чтобы плитка и лайтбокс
   *  показывали первый кадр, а не чёрный экран до запуска. */
  posterUrl?: string;
};

let _uid = 0;

/** Считать тип + длительность (для видео) и сделать objectURL-превью. */
export async function analyzeFile(file: File): Promise<StagedMedia> {
  const kind: "photo" | "video" = file.type.startsWith("video/")
    ? "video"
    : "photo";
  const previewUrl = URL.createObjectURL(file);
  let durationSec: number | undefined;
  let posterUrl: string | undefined;
  if (kind === "video") {
    durationSec = await readVideoDuration(previewUrl).catch(() => undefined);
    posterUrl = await makeVideoPoster(previewUrl).catch(() => undefined);
  }
  return { id: `s${++_uid}`, file, previewUrl, kind, durationSec, posterUrl };
}

/**
 * Снять кадр-постер из локального видео через canvas. Best-effort: на части
 * мобильных браузеров может не выйти — тогда undefined и показываем заглушку.
 * Постер нужен, чтобы плитка/лайтбокс не были чёрными до запуска видео.
 */
function makeVideoPoster(url: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v?: string) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.onloadeddata = () => {
      try {
        // небольшой отступ от 0 — на первом кадре часто чёрнота
        video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
      } catch {
        finish(undefined);
      }
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish(undefined);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/jpeg", 0.7));
      } catch {
        finish(undefined);
      }
    };
    video.onerror = () => finish(undefined);
    window.setTimeout(() => finish(undefined), 4000);
  });
}

function readVideoDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () =>
      resolve(Number.isFinite(v.duration) ? Math.round(v.duration) : 0);
    v.onerror = () => reject(new Error("video meta"));
    v.src = url;
  });
}

function fmtDuration(sec?: number | null): string {
  if (!sec || sec <= 0) return "видео";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function DamageMediaCapture({
  staged,
  uploaded,
  onPick,
  onRemoveStaged,
  onRemoveUploaded,
  busy,
  uploadProgress,
  disabled,
}: {
  staged: StagedMedia[];
  uploaded: ApiDamageMedia[];
  /** Файлы выбраны (камера или галерея) — родитель стейджит/грузит. */
  onPick: (files: File[]) => void;
  onRemoveStaged: (id: string) => void;
  onRemoveUploaded?: (mediaId: number) => void;
  /** Идёт загрузка staged → показываем спиннер поверх. */
  busy?: boolean;
  /** Прогресс заливки текущего файла 0..100 — для полосы. */
  uploadProgress?: number | null;
  disabled?: boolean;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  // На мобиле «Снять» открывает СВОЮ камеру (getUserMedia, высокое качество).
  // На десктопе (или без getUserMedia) — обычный input capture.
  const [cameraOpen, setCameraOpen] = useState(false);
  const canUseInAppCamera =
    isMobile &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) onPick(files);
    e.target.value = "";
  };
  const total = staged.length + uploaded.length;

  // Единый список для лайтбокса (тот же порядок, что в гриде: сперва
  // загруженные, потом локально выбранные). Индекс плитки = индекс здесь.
  const lightboxItems: LightboxItem[] = [
    ...uploaded.map((m) => ({
      kind: m.kind,
      url:
        m.kind === "photo"
          ? (fileUrl(m.fileKey, { variant: "view" }) ?? "")
          : (fileUrl(m.fileKey) ?? ""),
      poster:
        m.kind === "video"
          ? (fileUrl(m.posterKey, { variant: "view" }) ?? undefined)
          : undefined,
      processing: m.kind === "video" && m.status !== "ready",
      downloadUrl: fileUrl(m.fileKey) ?? undefined,
      durationSec: m.durationSec,
      name: m.fileName,
    })),
    ...staged.map((s) => ({
      kind: s.kind,
      url: s.previewUrl,
      poster: s.kind === "video" ? s.posterUrl : undefined,
      durationSec: s.durationSec,
    })),
  ];
  const [lightbox, setLightbox] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            canUseInAppCamera ? setCameraOpen(true) : camRef.current?.click()
          }
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-orange-soft text-[13.5px] font-bold text-orange-ink ring-1 ring-inset ring-orange-200 transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          <Camera size={18} /> Снять
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => galRef.current?.click()}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-surface-soft text-[13.5px] font-bold text-ink-2 ring-1 ring-inset ring-border transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          <Images size={18} /> Галерея
        </button>
      </div>

      {/* Полоса прогресса заливки (как в телеге): видно, сколько уже ушло на
          сервер, а не просто «ничего не происходит». */}
      {(busy || uploadProgress != null) && (
        <div className="rounded-xl bg-blue-50 px-3 py-2.5 ring-1 ring-inset ring-blue-100">
          {uploadProgress != null ? (
            <>
              <div className="mb-1.5 flex items-center justify-between text-[12.5px] font-semibold text-blue-700">
                <span>
                  {uploadProgress < 100
                    ? "Загружается на сервер"
                    : "Почти готово…"}
                </span>
                <span className="tabular-nums">{uploadProgress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-blue-200/60">
                <div
                  className="h-full rounded-full bg-blue-500 transition-[width] duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center gap-2 text-[13px] font-semibold text-blue-700">
              <Loader2 size={16} className="animate-spin" />
              Загружается на сервер, подождите…
            </div>
          )}
        </div>
      )}

      {/* capture="environment" — задняя камера телефона; фото ИЛИ видео */}
      <input
        ref={camRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={pick}
      />
      <input
        ref={galRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={pick}
      />

      {cameraOpen && (
        <CameraCapture
          onCapture={(file) => onPick([file])}
          onClose={() => setCameraOpen(false)}
          onFallback={() => camRef.current?.click()}
        />
      )}

      {/* «Снять» = камера приложения (getUserMedia) в высоком качестве —
          обходит ограничение iOS-инпута. «Галерея» — оригинал из медиатеки. */}
      <p className="text-[11px] leading-snug text-muted-2">
        {canUseInAppCamera
          ? "«Снять» — камера приложения в высоком качестве (один проход, без лишнего сжатия). «Галерея» — оригинал из медиатеки телефона."
          : "Для чётких деталей снимите в приложении «Камера» и приложите через «Галерея» — там полное качество."}
      </p>

      {total === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-soft px-3 py-4 text-center text-[12px] text-muted-2">
          Сфотографируйте или снимите видео повреждений — приложатся к акту.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {uploaded.map((m, i) => {
            const processing = m.kind === "video" && m.status !== "ready";
            return (
              <MediaTile
                key={`u${m.id}`}
                kind={m.kind}
                src={
                  processing
                    ? null
                    : m.kind === "photo"
                      ? fileUrl(m.fileKey, { variant: "thumb" })
                      : fileUrl(m.posterKey, { variant: "thumb" })
                }
                durationSec={m.durationSec}
                processing={processing}
                onOpen={() => setLightbox(i)}
                onRemove={
                  onRemoveUploaded ? () => onRemoveUploaded(m.id) : undefined
                }
              />
            );
          })}
          {staged.map((s, j) => (
            <MediaTile
              key={s.id}
              kind={s.kind}
              src={s.kind === "photo" ? s.previewUrl : (s.posterUrl ?? null)}
              durationSec={s.durationSec}
              busy={busy}
              onOpen={() => setLightbox(uploaded.length + j)}
              onRemove={() => onRemoveStaged(s.id)}
            />
          ))}
        </div>
      )}

      {lightbox != null && (
        <MediaLightbox
          items={lightboxItems}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

function MediaTile({
  kind,
  src,
  onOpen,
  durationSec,
  onRemove,
  busy,
  processing,
}: {
  kind: "photo" | "video";
  src: string | null;
  onOpen: () => void;
  durationSec?: number | null;
  onRemove?: () => void;
  busy?: boolean;
  /** Видео ещё перекодируется на сервере — показываем «обработка». */
  processing?: boolean;
}) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-ink/5 ring-1 ring-inset ring-border">
      {processing ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex h-full w-full flex-col items-center justify-center gap-1 bg-ink/85 text-white"
        >
          <Loader2 size={18} className="animate-spin" />
          <span className="text-[10px] font-semibold">обработка…</span>
          {durationSec ? (
            <span className="text-[9.5px] text-white/60 tabular-nums">
              {fmtDuration(durationSec)}
            </span>
          ) : null}
        </button>
      ) : src ? (
        <button
          type="button"
          onClick={onOpen}
          className="relative block h-full w-full transition-transform active:scale-[0.97]"
        >
          <img
            src={src}
            className="h-full w-full object-cover"
            alt="повреждение"
          />
          {kind === "video" && (
            <>
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55">
                  <Play size={16} className="fill-white text-white" />
                </span>
              </span>
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] font-semibold tabular-nums text-white">
                {fmtDuration(durationSec)}
              </span>
            </>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="flex h-full w-full flex-col items-center justify-center bg-ink text-white transition-transform active:scale-[0.97]"
        >
          <Play size={22} className="fill-white" />
          <span className="mt-1 rounded-full bg-white/15 px-1.5 text-[10.5px] font-semibold tabular-nums">
            {fmtDuration(durationSec)}
          </span>
        </button>
      )}
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Loader2 size={18} className="animate-spin text-white" />
        </div>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Убрать"
          className={cn(
            "absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white",
            "transition-transform active:scale-90",
          )}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
