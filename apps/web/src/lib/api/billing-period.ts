/**
 * v0.7: фронт-API для anchor'ов расчётного периода.
 *
 * useBillingPeriodAnchors() — список якорей с сервера; на onSuccess
 * прокидывает их в @/lib/billingPeriod через setBillingPeriodAnchors,
 * чтобы любой потребитель (currentBillingPeriod, useRevenue, dashboard,
 * RevenueCard, /rentals KPI) сразу видел корректные границы.
 *
 * useSwitchBillingPeriod() — POST /api/billing-period/anchors. Если
 * сервер ответил 400 ('transition_in_progress' / 'same_rule'), сообщение
 * прокидывается наружу через ошибку — UI настроек его покажет toast'ом.
 *
 * useCurrentBillingPeriodInfo() — GET /current, для индикатора в /settings
 * с текущим периодом и его типом ('regular' | 'transition').
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import {
  setBillingPeriodAnchors,
  type BillingAnchor,
} from "@/lib/billingPeriod";

const keys = {
  all: ["billing-period"] as const,
  anchors: () => [...keys.all, "anchors"] as const,
  current: () => [...keys.all, "current"] as const,
};

export type BillingPeriodCurrent = {
  ruleStartDay: number;
  period: {
    start: string; // YYYY-MM-DD
    end: string;
    kind: "regular" | "transition";
    ruleStartDay: number;
    label: string;
  };
  transitionActive: boolean;
};

export function useBillingPeriodAnchors() {
  return useQuery({
    queryKey: keys.anchors(),
    queryFn: async () => {
      const r = await api.get<{ items: BillingAnchor[] }>(
        "/api/billing-period/anchors",
      );
      setBillingPeriodAnchors(r.items);
      return r.items;
    },
    staleTime: 60_000,
  });
}

export function useCurrentBillingPeriodInfo() {
  return useQuery({
    queryKey: keys.current(),
    queryFn: () =>
      api.get<BillingPeriodCurrent>("/api/billing-period/current"),
    staleTime: 60_000,
  });
}

export type SwitchPlan = {
  currentPeriod: { start: string; end: string };
  transitionStart: string;
  transitionEnd: string;
  firstNewPeriodStart: string;
};

export function useSwitchBillingPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { newStartDay: number }) => {
      try {
        return await api.post<{ anchor: BillingAnchor; plan: SwitchPlan }>(
          "/api/billing-period/anchors",
          { newStartDay: args.newStartDay },
        );
      } catch (e) {
        // ApiError уже формирует читаемый message из body, прокидываем как есть.
        if (e instanceof ApiError) throw new Error(e.message);
        throw e;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
      // Дашборд / KPI / прочее тоже должны пересчитаться.
      qc.invalidateQueries({ queryKey: ["app-settings"] });
    },
  });
}
