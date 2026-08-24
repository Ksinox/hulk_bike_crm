import { useMemo } from "react";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useApiRentals, useApiRentalsArchived } from "@/lib/api/rentals";
import type { ApiPayment } from "@/lib/api/payments";

/**
 * Пункт 11 — партнёрская техника.
 *
 * Партнёрской считается техника моделей с флагом is_partner (пункт 14).
 * Процент инвестора задаётся НА ЕДИНИЦУ техники (scooters.partner_share),
 * по умолчанию 50 %. Выручка партнёрской техники попадает в общую выручку
 * ЗА ВЫЧЕТОМ доли инвестора; сам расчёт выплат — в разделе «Партнёрка».
 *
 * ВАЖНО: «Сводка дня» (касса) долю НЕ вычитает — деньги физически
 * получены, выплата инвестору происходит отдельно. Вычет применяется
 * к метрике «Выручка».
 */

export const DEFAULT_PARTNER_SHARE = 50;

export type PartnerInfo = {
  /** id партнёрских скутеров → доля инвестора (0..1). */
  shareByScooter: Map<number, number>;
  /** rentalId → доля инвестора (0..1) для аренд партнёрской техники. */
  shareByRental: Map<number, number>;
  /** Есть ли партнёрская техника вообще (для условного UI). */
  hasPartnerTech: boolean;
};

export function usePartnerInfo(): PartnerInfo {
  const { data: scooters = [] } = useApiScooters();
  const { data: models = [] } = useApiScooterModels();
  const { data: active = [] } = useApiRentals();
  const { data: archived = [] } = useApiRentalsArchived();

  return useMemo(() => {
    const partnerModelIds = new Set(
      models.filter((m) => m.isPartner).map((m) => m.id),
    );
    const shareByScooter = new Map<number, number>();
    for (const s of scooters) {
      if (s.modelId != null && partnerModelIds.has(s.modelId)) {
        const pct = s.partnerShare ?? DEFAULT_PARTNER_SHARE;
        shareByScooter.set(s.id, Math.min(100, Math.max(0, pct)) / 100);
      }
    }
    const shareByRental = new Map<number, number>();
    for (const r of [...active, ...archived]) {
      if (r.scooterId != null && shareByScooter.has(r.scooterId)) {
        shareByRental.set(r.id, shareByScooter.get(r.scooterId)!);
      }
    }
    return {
      shareByScooter,
      shareByRental,
      hasPartnerTech: shareByScooter.size > 0,
    };
  }, [scooters, models, active, archived]);
}

/**
 * Доля инвестора с платежа (₽, округление вниз). 0 — если платёж не
 * относится к аренде партнёрской техники.
 */
export function partnerCutOf(
  p: Pick<ApiPayment, "rentalId" | "amount">,
  shareByRental: Map<number, number>,
): number {
  if (p.rentalId == null) return 0;
  const share = shareByRental.get(p.rentalId);
  if (!share) return 0;
  return Math.floor(p.amount * share);
}
