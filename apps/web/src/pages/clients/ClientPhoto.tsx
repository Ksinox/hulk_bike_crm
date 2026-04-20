import { useRef, useState } from "react";
import { UserRound, Upload, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { guessGender, type Client } from "@/lib/mock/clients";
import { FilePreviewModal } from "./FilePreviewModal";
import { clientStore, useClientPhoto } from "./clientStore";
import type { UploadedFile } from "./DocUpload";

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, { w: number; stampSize: number; iconSize: number }> = {
  sm: { w: 40, stampSize: 8, iconSize: 18 },
  md: { w: 56, stampSize: 9, iconSize: 22 },
  lg: { w: 88, stampSize: 10, iconSize: 28 },
};

function Stamp({
  text,
  tone,
  fontPx,
}: {
  text: string;
  tone: "red" | "orange";
  fontPx: number;
}) {
  const toneCls =
    tone === "red"
      ? "bg-red/85 border-red text-white"
      : "bg-orange/85 border-orange text-white";
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-[-25%] top-[42%] -rotate-[16deg] border-y-[1.5px] text-center font-extrabold uppercase tracking-[0.15em] shadow-card-sm",
        toneCls,
      )}
      style={{ fontSize: `${fontPx}px`, paddingTop: 2, paddingBottom: 2 }}
    >
      {text}
    </div>
  );
}

export function ClientPhoto({
  client,
  size = "lg",
  onChange,
}: {
  client: Client;
  size?: Size;
  onChange?: (next: UploadedFile | null) => void;
}) {
  const photo = useClientPhoto(client.id);
  const [previewing, setPreviewing] = useState(false);
  const replaceRef = useRef<HTMLInputElement>(null);

  const gender = guessGender(client.name);
  const stamp = client.blacklisted
    ? { text: "ЧЁРНЫЙ СПИСОК", tone: "red" as const }
    : client.debt > 0
      ? { text: "ДОЛЖНИК", tone: "orange" as const }
      : null;

  const dims = SIZES[size];

  const applyFile = (f: File) => {
    if (!f.type.startsWith("image/")) return;
    const uf: UploadedFile = {
      name: f.name,
      size: f.size,
      thumbUrl: URL.createObjectURL(f),
      title: `Фото · ${client.name}`,
    };
    if (onChange) onChange(uf);
    else clientStore.setPhoto(client.id, uf);
  };

  const handleDelete = () => {
    if (onChange) onChange(null);
    else clientStore.setPhoto(client.id, null);
    setPreviewing(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (photo) setPreviewing(true);
          else replaceRef.current?.click();
        }}
        className={cn(
          "group relative overflow-hidden rounded-[14px] border border-border bg-surface-soft text-muted shadow-card-sm transition-transform",
          photo && "hover:scale-[1.02]",
        )}
        style={{ width: dims.w, aspectRatio: "9 / 16" }}
        title={photo ? "Открыть фото" : "Загрузить фото"}
      >
        <input
          ref={replaceRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) applyFile(f);
            e.target.value = "";
          }}
        />

        {photo?.thumbUrl ? (
          <img
            src={photo.thumbUrl}
            alt={client.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-center">
            <div
              className={cn(
                "flex items-center justify-center rounded-full",
                gender === "female"
                  ? "bg-purple-soft text-purple-ink"
                  : "bg-blue-100 text-blue-700",
              )}
              style={{
                width: dims.iconSize + 10,
                height: dims.iconSize + 10,
              }}
            >
              <UserRound size={dims.iconSize} />
            </div>
            {size !== "sm" && (
              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-2">
                Нет фото
              </div>
            )}
          </div>
        )}

        {stamp && (
          <Stamp text={stamp.text} tone={stamp.tone} fontPx={dims.stampSize} />
        )}
      </button>

      {previewing && photo && (
        <FilePreviewModal
          file={photo}
          onClose={() => setPreviewing(false)}
          actions={
            <>
              <button
                type="button"
                onClick={() => replaceRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-3 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-border"
              >
                <Upload size={13} /> Заменить
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center gap-1 rounded-full bg-red-soft px-3 py-1.5 text-[12px] font-semibold text-red-ink transition-colors hover:bg-red/20"
              >
                <Trash2 size={13} /> Удалить
              </button>
            </>
          }
        />
      )}
    </>
  );
}
