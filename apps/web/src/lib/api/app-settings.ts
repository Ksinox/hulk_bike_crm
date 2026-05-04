import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { setBillingPeriodStartDay } from "@/lib/billingPeriod";

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
 * v0.4.1: список всех настроек. На onSuccess подхватываем
 * billing_period_start_day и прокидываем в @/lib/billingPeriod —
 * чтобы все KPI/отчёты пересчитались на новый день старта периода.
 */
export function useAppSettings() {
  return useQuery({
    queryKey: keys.list(),
    queryFn: async () => {
      const r = await api.get<{ items: AppSetting[] }>("/api/app-settings");
      const map = new Map(r.items.map((s) => [s.key, s.value]));
      const startDayStr = map.get("billing_period_start_day");
      const startDay = startDayStr ? Number(startDayStr) : 15;
      if (Number.isFinite(startDay) && startDay >= 1 && startDay <= 28) {
        setBillingPeriodStartDay(startDay);
      }
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
