import { useMemo } from "react";
import { useApiScooters, usePartnerShare } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useApiInvestors } from "@/lib/api/investors";
import { useApiRentals, useApiRentalsArchived } from "@/lib/api/rentals";

/**
 * Пункт 11 — партнёрская техника.
 *
 * Правка 27.08: процент — свойство ИНВЕСТОРА (investors.share). Единица
 * с инвестором наследует его процент; scooters.partner_share остался
 * только как fallback для партнёрских единиц без инвестора (legacy).
 * Выручка партнёрской техники попадает в общую выручку ЗА ВЫЧЕТОМ доли
 * инвестора; сам расчёт выплат — в разделе «Партнёрка».
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
  /**
   * Аренды, которых в «Выручке» быть не должно вовсе (заказчик, 06.09):
   * партнёрская техника И любой электротранспорт — даже если единицу
   * завели без флага «партнёрская». Раньше исключали только по флагу.
   */
  excludedRentals: Set<number>;
};

export function usePartnerInfo(): PartnerInfo {
  const { data: scooters = [] } = useApiScooters();
  const shareQ = usePartnerShare();
  const { data: investorsData } = useApiInvestors();
  const { data: active = [] } = useApiRentals();
  const { data: archived = [] } = useApiRentalsArchived();
  const { data: models = [] } = useApiScooterModels();

  return useMemo(() => {
    const electroModels = new Set(models.filter((m) => m.isElectric).map((m) => m.id));
    // Правка 24.08: партнёрская — сама ЕДИНИЦА техники (scooters.isPartner).
    // Правка 27.08: процент подтягивается от ИНВЕСТОРА единицы; единица без
    // инвестора — её старый процент либо общий из настроек (legacy).
    const fallback = shareQ.data?.value ?? DEFAULT_PARTNER_SHARE;
    const shareByInvestor = new Map(
      (investorsData?.items ?? []).map((i) => [i.id, i.share] as const),
    );
    const shareByScooter = new Map<number, number>();
    for (const s of scooters) {
      if (s.isPartner) {
        const pct =
          (s.investorId != null ? shareByInvestor.get(s.investorId) : null) ??
          s.partnerShare ??
          fallback;
        shareByScooter.set(s.id, Math.min(100, Math.max(0, pct)) / 100);
      }
    }
    const excludedScooters = new Set<number>(shareByScooter.keys());
    for (const s of scooters) {
      if (s.modelId != null && electroModels.has(s.modelId)) excludedScooters.add(s.id);
    }
    const shareByRental = new Map<number, number>();
    const excludedRentals = new Set<number>();
    for (const r of [...active, ...archived]) {
      if (r.scooterId == null) continue;
      if (shareByScooter.has(r.scooterId)) {
        shareByRental.set(r.id, shareByScooter.get(r.scooterId)!);
      }
      if (excludedScooters.has(r.scooterId)) excludedRentals.add(r.id);
    }
    return {
      shareByScooter,
      shareByRental,
      hasPartnerTech: shareByScooter.size > 0,
      excludedRentals,
    };
  }, [scooters, shareQ.data, investorsData, active, archived, models]);
}

/**
 * Доля инвестора с платежа (₽, округление вниз). 0 — если платёж не
 * относится к аренде партнёрской техники.
 */
export function partnerCutOf(
  p: { rentalId?: number | null; amount: number },
  shareByRental: Map<number, number>,
): number {
  if (p.rentalId == null) return 0;
  const share = shareByRental.get(p.rentalId);
  if (!share) return 0;
  return Math.floor(p.amount * share);
}
