import { useMemo, useRef, useState } from "react";
import { UserRound, Upload, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { guessGender, type Client } from "@/lib/mock/clients";
import { FilePreviewModal } from "./FilePreviewModal";
import { clientStore, useClientPhoto } from "./clientStore";
import type { UploadedFile } from "./DocUpload";
import {
  useApiClientDocs,
  useUploadClientDoc,
  useDeleteClientDoc,
} from "@/lib/api/documents";
import { fileUrl } from "@/lib/files";
import { toast } from "@/lib/toast";

type Size = "sm" | "md" | "lg" | "xl";

const SIZES: Record<Size, { w: number; stampSize: number; iconSize: number }> = {
  sm: { w: 40, stampSize: 7, iconSize: 18 },
  md: { w: 56, stampSize: 8, iconSize: 22 },
  lg: { w: 88, stampSize: 9, iconSize: 28 },
  xl: { w: 132, stampSize: 11, iconSize: 36 },
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
      ? "bg-red/60 border-red/70 text-white"
      : "bg-orange/65 border-orange/75 text-white";
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-[-30%] top-[44%] -rotate-[16deg] border-y-[1px] text-center font-extrabold uppercase tracking-[0.08em]",
        toneCls,
      )}
      style={{
        fontSize: `${fontPx}px`,
        paddingTop: 1,
        paddingBottom: 1,
        textShadow: "0 1px 2px rgba(0,0,0,0.35)",
      }}
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
  const localPhoto = useClientPhoto(client.id);
  // Серверное фото (kind='photo' в client_documents) — приоритетнее
  // локально загруженного через clientStore. Это нужно чтобы селфи из
  // публичной заявки автоматически становилось аватаром клиента: при
  // конверсии convert копирует selfie в client_documents с kind='photo',
  // и здесь оно подхватывается без ручной перезагрузки.
  const docsQ = useApiClientDocs(client.id);
  const photoDoc = useMemo(
    () => (docsQ.data ?? []).find((d) => d.kind === "photo"),
    [docsQ.data],
  );
  // v0.4.62: фото клиента в карточке/списке — небольшое превью,
  // используем thumb-вариант (~30 КБ).
  const photoFromDocsUrl = photoDoc
    ? fileUrl(photoDoc.fileKey, { variant: "thumb" })
    : null;
  const photoFromDocs: UploadedFile | null =
    photoDoc && photoFromDocsUrl
      ? {
          name: photoDoc.fileName,
          size: photoDoc.size,
          thumbUrl: photoFromDocsUrl,
          title: photoDoc.title || `Фото · ${client.name}`,
        }
      : null;
  const photo = photoFromDocs ?? localPhoto;
  const [previewing, setPreviewing] = useState(false);
  const replaceRef = useRef<HTMLInputElement>(null);

  // v0.7.4: фото клиента теперь персистится в БД (client_documents
  // kind='photo'), как паспорт/права. Раньше оно жило только в
  // локальном clientStore.photos → пропадало после F5.
  const uploadDoc = useUploadClientDoc(client.id);
  const deleteDoc = useDeleteClientDoc(client.id);
  const busy = uploadDoc.isPending || deleteDoc.isPending;

  const gender = guessGender(client.name);
  const stamp = client.blacklisted
    ? { text: "ЧЁРНЫЙ СПИСОК", tone: "red" as const }
    : client.debt > 0
      ? { text: "ДОЛЖНИК", tone: "orange" as const }
      : null;

  const dims = SIZES[size];

  const applyFile = async (f: File) => {
    if (!f.type.startsWith("image/")) return;
    // Контролируемый режим (форма редактирования) — отдаём File наверх,
    // персист делает вызывающая сторона.
    if (onChange) {
      onChange({
        name: f.name,
        size: f.size,
        thumbUrl: URL.createObjectURL(f),
        title: `Фото · ${client.name}`,
        file: f,
      });
      return;
    }
    // Оптимистичное превью пока идёт upload.
    clientStore.setPhoto(client.id, {
      name: f.name,
      size: f.size,
      thumbUrl: URL.createObjectURL(f),
      title: `Фото · ${client.name}`,
    });
    try {
      // Удаляем прежние фото (kind='photo'), чтобы не плодить дубли —
      // read-path берёт первое по id, новое должно заменить старое.
      const oldPhotos = (docsQ.data ?? []).filter((d) => d.kind === "photo");
      await uploadDoc.mutateAsync({
        kind: "photo",
        file: f,
        title: `Фото · ${client.name}`,
      });
      for (const old of oldPhotos) {
        await deleteDoc.mutateAsync(old.id).catch(() => {});
      }
      // Дожидаемся свежих docs прежде чем снять оптимистичную подмену —
      // иначе на миг показались бы инициалы между «убрали локальное» и
      // «приехало серверное».
      await docsQ.refetch();
      clientStore.setPhoto(client.id, null);
      toast.success("Фото сохранено", "");
    } catch (e) {
      clientStore.setPhoto(client.id, null);
      toast.error("Не удалось сохранить фото", (e as Error).message ?? "");
    }
  };

  const handleDelete = async () => {
    setPreviewing(false);
    if (onChange) {
      onChange(null);
      return;
    }
    const oldPhotos = (docsQ.data ?? []).filter((d) => d.kind === "photo");
    clientStore.setPhoto(client.id, null);
    try {
      for (const old of oldPhotos) {
        await deleteDoc.mutateAsync(old.id);
      }
    } catch (e) {
      toast.error("Не удалось удалить фото", (e as Error).message ?? "");
    }
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

        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/40 text-white">
            <Loader2 size={dims.iconSize} className="animate-spin" />
          </div>
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
