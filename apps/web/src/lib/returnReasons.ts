import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Пункт 4 — справочник причин возврата (закрытия аренды).
 *
 * Живёт в app_settings['return_reasons'] как JSON-массив строк. Список
 * РАСТЁТ: «свой вариант с сохранением» добавляет причину для будущих
 * закрытий (без подтверждения); удаление из списка — с подтверждением.
 */

export const DEFAULT_RETURN_REASONS = [
  "Уезжает в отпуск",
  "Другая работа",
  "Дорого",
  "Низкое качество аренды",
  "Уходит с доставки",
];

const KEY = "return_reasons";

function parse(value: string | undefined | null): string[] {
  if (!value) return DEFAULT_RETURN_REASONS;
  try {
    const arr = JSON.parse(value);
    if (Array.isArray(arr) && arr.every((x) => typeof x === "string"))
      return arr.length > 0 ? arr : DEFAULT_RETURN_REASONS;
  } catch {
    /* битое значение — дефолт */
  }
  return DEFAULT_RETURN_REASONS;
}

export function useReturnReasons() {
  const q = useQuery({
    queryKey: ["app-settings", KEY],
    queryFn: async () => {
      try {
        const r = await api.get<{ key: string; value: string }>(
          `/api/app-settings/${KEY}`,
        );
        return parse(r.value);
      } catch {
        return DEFAULT_RETURN_REASONS; // ключа ещё нет
      }
    },
    staleTime: 60_000,
  });
  return { reasons: q.data ?? DEFAULT_RETURN_REASONS, isLoading: q.isLoading };
}

export function useSaveReturnReasons() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reasons: string[]) =>
      api.put(`/api/app-settings/${KEY}`, {
        value: JSON.stringify(reasons.slice(0, 30)),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["app-settings", KEY] }),
  });
}
