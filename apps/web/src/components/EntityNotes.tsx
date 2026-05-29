/**
 * v0.8.21 — менеджер заметок для карточек клиента/скутера (и любых сущностей).
 *
 * В отличие от «приклеенных» стикеров на карточке аренды, здесь — компактный
 * список заметок (стикеры той же модели note_stickers): добавить (с выбором
 * цвета), открепить/подкрепить, удалить. Активные сверху, откреплённые — ниже
 * с пометкой. Всё пишется в журнал действий (note_added/unpinned/pinned/deleted).
 */
import { useState } from "react";
import { Plus, Pin, PinOff, Trash2, StickyNote, PhoneOff, SquareParking } from "lucide-react";
import { cn } from "@/lib/utils";
import { NoteComposer, STICKER_COLORS } from "./StickerStack";
import {
  useStickers,
  useCreateSticker,
  useUnpinSticker,
  useRepinSticker,
  useDeleteSticker,
  type StickerEntity,
} from "@/lib/api/stickers";
import { toast } from "@/lib/toast";

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function EntityNotes({
  entity,
  entityId,
}: {
  entity: StickerEntity;
  entityId: number;
}) {
  const { data: allRaw = [] } = useStickers(entity, entityId, true);
  const create = useCreateSticker();
  const unpin = useUnpinSticker();
  const repin = useRepinSticker();
  const del = useDeleteSticker();
  const [composing, setComposing] = useState(false);

  const sorted = [...allRaw].sort((a, b) => {
    // активные (на карточке) сверху, затем по дате убыв.
    const ap = a.dismissedAt ? 1 : 0;
    const bp = b.dismissedAt ? 1 : 0;
    if (ap !== bp) return ap - bp;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
          Заметки{sorted.length ? ` · ${sorted.length}` : ""}
        </span>
        {!composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-300 bg-amber-50/70 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
          >
            <Plus size={12} /> Заметка
          </button>
        )}
      </div>

      {composing && (
        <NoteComposer
          onSubmit={(text, color) =>
            create.mutate({ entity, entityId, kind: "note", text, color })
          }
          onCancel={() => setComposing(false)}
        />
      )}

      {sorted.length === 0 && !composing ? (
        <div className="text-[12px] text-muted">Заметок пока нет</div>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((s) => {
            const Icon =
              s.kind === "contact"
                ? PhoneOff
                : s.kind === "parking"
                  ? SquareParking
                  : StickyNote;
            const dot = (STICKER_COLORS[s.color] ?? STICKER_COLORS.yellow!).split(
              " ",
            )[0];
            return (
              <div
                key={s.id}
                className={cn(
                  "flex items-start gap-2 rounded-[10px] border px-3 py-2",
                  s.dismissedAt
                    ? "border-border bg-surface-soft/40"
                    : "border-amber-200 bg-amber-50/50",
                )}
              >
                <span
                  className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", dot)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-2">
                    <Icon size={10} />
                    {s.kind === "contact"
                      ? "Связь"
                      : s.kind === "parking"
                        ? "Паркинг"
                        : "Заметка"}
                    {s.dismissedAt ? (
                      <span className="rounded-full bg-surface px-1.5 py-0.5 text-[9px] font-medium text-muted">
                        откреплена
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
                        на карточке
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-ink-2">
                    {s.text}
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-2">
                    {s.createdByName ?? "—"} · {fmt(s.createdAt)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {s.dismissedAt ? (
                    <button
                      type="button"
                      onClick={() =>
                        repin.mutate(
                          { id: s.id },
                          { onSuccess: () => toast.success("Подкреплено") },
                        )
                      }
                      title="Подкрепить"
                      className="rounded-md p-1 text-muted-2 hover:bg-amber-100 hover:text-amber-700"
                    >
                      <Pin size={14} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        unpin.mutate(
                          { id: s.id },
                          { onSuccess: () => toast.success("Откреплено") },
                        )
                      }
                      title="Открепить"
                      className="rounded-md p-1 text-muted-2 hover:bg-surface-soft hover:text-ink"
                    >
                      <PinOff size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => del.mutate({ id: s.id })}
                    title="Удалить"
                    className="rounded-md p-1 text-muted-2 hover:bg-red-soft hover:text-red-ink"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
