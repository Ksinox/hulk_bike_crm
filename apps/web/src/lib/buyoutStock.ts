import type { BuyoutDeal } from "@/lib/api/buyout";

/**
 * Техника для выкупа (заказчик, 06.09, п.13–14).
 *
 * Категория «Выкуп» в Скутерах — это и техника, которая уже у клиента по
 * договору, и техника, которую мы только готовы отдать в выкуп. Разница —
 * есть ли по ней живая сделка. Мастер выкупа предлагает только вторую
 * группу; раздел «Выкуп → Доступные» показывает её же.
 */

/** Сделка держит технику у клиента: подписана или договор уже сформирован. */
const RESERVING = new Set<BuyoutDeal["status"]>(["active", "contract"]);

/** По id техники — сделка, из-за которой она сейчас у клиента. */
export function buyoutDealByScooter(deals: BuyoutDeal[]): Map<number, BuyoutDeal> {
  const m = new Map<number, BuyoutDeal>();
  for (const d of deals) {
    if (d.scooterId != null && RESERVING.has(d.status)) m.set(d.scooterId, d);
  }
  return m;
}

type StockLike = {
  id: number;
  baseStatus: string;
  archivedAt?: string | null;
  isPartner?: boolean;
};

/**
 * Техника категории «Выкуп», которая сейчас не у клиента.
 * `keepId` — техника текущей сделки: её показываем всегда, иначе при
 * продолжении черновика выбранный скутер пропадал бы из списка.
 */
export function availableForBuyout<T extends StockLike>(
  scooters: T[],
  deals: BuyoutDeal[],
  keepId?: number | null,
): T[] {
  const taken = buyoutDealByScooter(deals);
  return scooters.filter(
    (s) =>
      !s.archivedAt &&
      !s.isPartner &&
      (s.baseStatus === "buyout" || s.id === keepId) &&
      (!taken.has(s.id) || s.id === keepId),
  );
}
