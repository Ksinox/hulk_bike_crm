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

/**
 * 22.10 (заказчик): справочник поломок — для замены с причиной «Поломка» и
 * сдачи скутера в ремонт. Растёт так же: «свой вариант» сохраняется для
 * быстрого выбора в будущем. app_settings['breakdown_reasons'].
 */
export const DEFAULT_BREAKDOWN_REASONS = [
  "Не заводится",
  "Перегрев",
  "Тормоза",
  "Колесо / прокол",
  "Электрика / свет",
  "Вариатор / ремень",
];

/** Какой справочник: причины возврата или поломки. */
export type ReasonListKind = "return" | "breakdown";

const LISTS: Record<ReasonListKind, { key: string; defaults: string[] }> = {
  return: { key: "return_reasons", defaults: DEFAULT_RETURN_REASONS },
  breakdown: { key: "breakdown_reasons", defaults: DEFAULT_BREAKDOWN_REASONS },
};

function parse(value: string | undefined | null, defaults: string[]): string[] {
  if (!value) return defaults;
  try {
    const arr = JSON.parse(value);
    if (Array.isArray(arr) && arr.every((x) => typeof x === "string"))
      return arr.length > 0 ? arr : defaults;
  } catch {
    /* битое значение — дефолт */
  }
  return defaults;
}

export function useReasonList(kind: ReasonListKind = "return") {
  const { key, defaults } = LISTS[kind];
  const q = useQuery({
    queryKey: ["app-settings", key],
    queryFn: async () => {
      try {
        const r = await api.get<{ key: string; value: string }>(
          `/api/app-settings/${key}`,
        );
        return parse(r.value, defaults);
      } catch {
        return defaults; // ключа ещё нет
      }
    },
    staleTime: 60_000,
  });
  return { reasons: q.data ?? defaults, isLoading: q.isLoading };
}

export function useSaveReasonList(kind: ReasonListKind = "return") {
  const { key } = LISTS[kind];
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reasons: string[]) =>
      api.put(`/api/app-settings/${key}`, {
        value: JSON.stringify(reasons.slice(0, 30)),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["app-settings", key] }),
  });
}

export const useReturnReasons = () => useReasonList("return");
export const useSaveReturnReasons = () => useSaveReasonList("return");
export function defaultReasons(kind: ReasonListKind): string[] {
  return LISTS[kind].defaults;
}
