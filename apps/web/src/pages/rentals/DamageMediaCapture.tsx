import { useRef } from "react";
import { Camera, Images, X, Play, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/files";
import type { ApiDamageMedia } from "@/lib/api/damage-reports";

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
};

let _uid = 0;

/** Считать тип + длительность (для видео) и сделать objectURL-превью. */
export async function analyzeFile(file: File): Promise<StagedMedia> {
  const kind: "photo" | "video" = file.type.startsWith("video/")
    ? "video"
    : "photo";
  const previewUrl = URL.createObjectURL(file);
  let durationSec: number | undefined;
  if (kind === "video") {
    durationSec = await readVideoDuration(previewUrl).catch(() => undefined);
  }
  return { id: `s${++_uid}`, file, previewUrl, kind, durationSec };
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
  disabled?: boolean;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) onPick(files);
    e.target.value = "";
  };
  const total = staged.length + uploaded.length;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => camRef.current?.click()}
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

      {total === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-soft px-3 py-4 text-center text-[12px] text-muted-2">
          Сфотографируйте или снимите видео повреждений — приложатся к акту.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {uploaded.map((m) => (
            <MediaTile
              key={`u${m.id}`}
              kind={m.kind}
              src={
                m.kind === "photo"
                  ? fileUrl(m.fileKey, { variant: "thumb" })
                  : null
              }
              openUrl={fileUrl(m.fileKey, {
                variant: m.kind === "photo" ? "view" : undefined,
              })}
              durationSec={m.durationSec}
              onRemove={
                onRemoveUploaded ? () => onRemoveUploaded(m.id) : undefined
              }
            />
          ))}
          {staged.map((s) => (
            <MediaTile
              key={s.id}
              kind={s.kind}
              src={s.kind === "photo" ? s.previewUrl : null}
              openUrl={s.previewUrl}
              durationSec={s.durationSec}
              busy={busy}
              onRemove={() => onRemoveStaged(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MediaTile({
  kind,
  src,
  openUrl,
  durationSec,
  onRemove,
  busy,
}: {
  kind: "photo" | "video";
  src: string | null;
  openUrl: string | null;
  durationSec?: number | null;
  onRemove?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-ink/5 ring-1 ring-inset ring-border">
      {kind === "photo" && src ? (
        <a href={openUrl ?? undefined} target="_blank" rel="noreferrer">
          <img
            src={src}
            className="h-full w-full object-cover"
            alt="повреждение"
          />
        </a>
      ) : (
        <a
          href={openUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="flex h-full w-full flex-col items-center justify-center bg-ink text-white"
        >
          <Play size={20} className="fill-white" />
          <span className="mt-1 text-[10.5px] font-semibold tabular-nums">
            {fmtDuration(durationSec)}
          </span>
        </a>
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
