import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { setWorkingHours } from "@/lib/workingHours";

export type AppSetting = {
  key: string;
  value: string;
  updatedAt: string;
  updatedByUserId: number | null;
};

const keys = {
  all: ["app-settings"] as const,
  list: () => [...keys.all, "list"] as const,
};

/**
 * v0.4.1: список всех настроек. На onSuccess прокидываем график работы
 * в @/lib/workingHours.
 *
 * v0.9.4: БОЛЬШЕ НЕ трогаем расчётный период из app_settings.
 * Раньше отсюда вызывался setBillingPeriodStartDay(billing_period_start_day),
 * что перетирало авторитетные якоря (billing_period_anchors) легаси-плоским
 * значением — и при гонке загрузок период «прыгал» (напр. фронт показывал
 * день 3 из orphaned app_settings, хотя якорь и сервер = день 15). Источник
 * правды теперь ТОЛЬКО якоря (useBillingPeriodAnchors в App.tsx). Плоское
 * billing_period_start_day осталось лишь для обратной совместимости сервера.
 */
export function useAppSettings() {
  return useQuery({
    queryKey: keys.list(),
    queryFn: async () => {
      const r = await api.get<{ items: AppSetting[] }>("/api/app-settings");
      const map = new Map(r.items.map((s) => [s.key, s.value]));
      // v0.4.21: график работы (часы открытия/закрытия)
      const whStart = Number(map.get("work_hours_start") ?? "9");
      const whEnd = Number(map.get("work_hours_end") ?? "22");
      setWorkingHours(whStart, whEnd);
      return r.items;
    },
    staleTime: 60_000,
  });
}

export function useSetAppSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { key: string; value: string }) =>
      api.put<AppSetting>(`/api/app-settings/${args.key}`, {
        value: args.value,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}
