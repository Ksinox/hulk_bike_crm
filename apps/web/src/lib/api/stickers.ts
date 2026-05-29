/**
 * v0.8.12 — стикеры-заметки.
 *
 * Жёлтые «наклейки» поверх карточек. На одну сущность (аренда/клиент) можно
 * прикрепить несколько. kind: 'note' — обычная заметка; 'contact' —
 * комментарий к статусу «не выходит на связь». Снятие — мягкое (dismiss),
 * запись остаётся в БД и в журнале действий для аудита.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type StickerEntity = "rental" | "client";
export type StickerKind = "note" | "contact" | "parking";

export type NoteSticker = {
  id: number;
  entity: StickerEntity;
  entityId: number;
  kind: StickerKind;
  text: string;
  color: string;
  createdByName: string | null;
  createdAt: string;
  dismissedAt: string | null;
  dismissedByName: string | null;
};

export const stickerKeys = {
  all: ["stickers"] as const,
  list: (entity: StickerEntity, entityId: number) =>
    ["stickers", entity, entityId] as const,
};

export function useStickers(
  entity: StickerEntity,
  entityId: number | null | undefined,
  includeDismissed = false,
) {
  return useQuery({
    queryKey: [...stickerKeys.list(entity, entityId ?? 0), includeDismissed],
    queryFn: () =>
      api.get<NoteSticker[]>(
        `/api/stickers?entity=${entity}&entityId=${entityId}${includeDismissed ? "&includeDismissed=1" : ""}`,
      ),
    enabled: entityId != null && entityId > 0,
    staleTime: 30_000,
  });
}

/**
 * Стикеры карточки аренды: заметки самой аренды + комментарии по связи
 * клиента. Возвращает объединённый список, свежие — первыми.
 * includeDismissed=true — включая откреплённые (для раздела «Заметки»).
 */
export function useRentalCardStickers(
  rentalId: number | null | undefined,
  clientId: number | null | undefined,
  includeDismissed = false,
) {
  const rentalQ = useStickers("rental", rentalId, includeDismissed);
  const clientQ = useStickers("client", clientId, includeDismissed);
  const stickers = useMemo(() => {
    const list = [...(rentalQ.data ?? []), ...(clientQ.data ?? [])];
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [rentalQ.data, clientQ.data]);
  return { stickers, isLoading: rentalQ.isLoading || clientQ.isLoading };
}

function useInvalidateStickers() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: stickerKeys.all });
    qc.invalidateQueries({ queryKey: ["activity"] });
    qc.invalidateQueries({ queryKey: ["clients"] });
  };
}

export function useCreateSticker() {
  const invalidate = useInvalidateStickers();
  return useMutation({
    mutationFn: (args: {
      entity: StickerEntity;
      entityId: number;
      kind?: StickerKind;
      text: string;
      color?: string;
    }) => api.post<NoteSticker>("/api/stickers", args),
    onSuccess: invalidate,
  });
}

/** Открепить стикер (мягко): уходит с карточки в раздел «Заметки». */
export function useUnpinSticker() {
  const invalidate = useInvalidateStickers();
  return useMutation({
    mutationFn: (args: { id: number }) =>
      api.post<NoteSticker>(`/api/stickers/${args.id}/dismiss`, {}),
    onSuccess: invalidate,
  });
}

/** Подкрепить откреплённый стикер обратно на карточку. */
export function useRepinSticker() {
  const invalidate = useInvalidateStickers();
  return useMutation({
    mutationFn: (args: { id: number }) =>
      api.post<NoteSticker>(`/api/stickers/${args.id}/pin`, {}),
    onSuccess: invalidate,
  });
}

/** Полное удаление стикера (из раздела «Заметки»). */
export function useDeleteSticker() {
  const invalidate = useInvalidateStickers();
  return useMutation({
    mutationFn: (args: { id: number }) =>
      api.delete<{ ok: true }>(`/api/stickers/${args.id}`),
    onSuccess: invalidate,
  });
}
