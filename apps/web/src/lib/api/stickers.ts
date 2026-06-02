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

export type StickerEntity = "rental" | "client" | "scooter";
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
  enabled = true,
) {
  return useQuery({
    queryKey: [...stickerKeys.list(entity, entityId ?? 0), includeDismissed],
    queryFn: () =>
      api.get<NoteSticker[]>(
        `/api/stickers?entity=${entity}&entityId=${entityId}${includeDismissed ? "&includeDismissed=1" : ""}`,
      ),
    enabled: enabled && entityId != null && entityId > 0,
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

/**
 * v0.8.24: оптимистичный патч всех кешей стикеров — чтобы открепление/
 * подкрепление/удаление отражалось МГНОВЕННО (без обновления страницы).
 * Учитывает вариант запроса (active vs includeDismissed) по последнему
 * элементу ключа.
 */
function useStickerOptimistic() {
  const qc = useQueryClient();
  const invalidate = useInvalidateStickers();
  const patch = async (id: number, action: "unpin" | "repin" | "delete") => {
    await qc.cancelQueries({ queryKey: stickerKeys.all });
    const now = new Date().toISOString();
    let found: NoteSticker | undefined;
    qc.getQueriesData<NoteSticker[]>({ queryKey: stickerKeys.all }).forEach(
      ([, data]) => {
        const f = data?.find((s) => s.id === id);
        if (f) found = f;
      },
    );
    qc.getQueriesData<NoteSticker[]>({ queryKey: stickerKeys.all }).forEach(
      ([key, data]) => {
        if (!data) return;
        const includeDismissed = key[key.length - 1] === true;
        let next: NoteSticker[];
        if (action === "delete") {
          next = data.filter((s) => s.id !== id);
        } else if (action === "unpin") {
          next = includeDismissed
            ? data.map((s) => (s.id === id ? { ...s, dismissedAt: now } : s))
            : data.filter((s) => s.id !== id);
        } else {
          // repin
          if (includeDismissed) {
            next = data.map((s) =>
              s.id === id ? { ...s, dismissedAt: null } : s,
            );
          } else if (data.some((s) => s.id === id)) {
            next = data.map((s) =>
              s.id === id ? { ...s, dismissedAt: null } : s,
            );
          } else if (found) {
            next = [{ ...found, dismissedAt: null }, ...data];
          } else {
            next = data;
          }
        }
        qc.setQueryData(key, next);
      },
    );
  };
  return { patch, invalidate };
}

/** Открепить стикер (мягко): уходит с карточки в раздел «Заметки». */
export function useUnpinSticker() {
  const { patch, invalidate } = useStickerOptimistic();
  return useMutation({
    mutationFn: (args: { id: number }) =>
      api.post<NoteSticker>(`/api/stickers/${args.id}/dismiss`, {}),
    onMutate: ({ id }) => patch(id, "unpin"),
    onError: invalidate,
    onSettled: invalidate,
  });
}

/** Подкрепить откреплённый стикер обратно на карточку. */
export function useRepinSticker() {
  const { patch, invalidate } = useStickerOptimistic();
  return useMutation({
    mutationFn: (args: { id: number }) =>
      api.post<NoteSticker>(`/api/stickers/${args.id}/pin`, {}),
    onMutate: ({ id }) => patch(id, "repin"),
    onError: invalidate,
    onSettled: invalidate,
  });
}

/** Полное удаление стикера (из раздела «Заметки»). */
export function useDeleteSticker() {
  const { patch, invalidate } = useStickerOptimistic();
  return useMutation({
    mutationFn: (args: { id: number }) =>
      api.delete<{ ok: true }>(`/api/stickers/${args.id}`),
    onMutate: ({ id }) => patch(id, "delete"),
    onError: invalidate,
    onSettled: invalidate,
  });
}
