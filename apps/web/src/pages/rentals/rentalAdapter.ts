import type { Rental } from "@/lib/mock/rentals";
import type { ApiRental, ApiScooter } from "@/lib/api/types";

/** ISO "2026-09-14T12:00:00Z" → { date: "14.09.2026", time: "12:00" } в MSK */
function splitIsoDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  // Рендерим в московском времени (UTC+3) без DST
  const msk = new Date(d.getTime() + 3 * 3600 * 1000);
  const dd = String(msk.getUTCDate()).padStart(2, "0");
  const mm = String(msk.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = msk.getUTCFullYear();
  const hh = String(msk.getUTCHours()).padStart(2, "0");
  const mi = String(msk.getUTCMinutes()).padStart(2, "0");
  return { date: `${dd}.${mm}.${yyyy}`, time: `${hh}:${mi}` };
}

export function adaptRental(
  r: ApiRental,
  scootersById: Map<number, ApiScooter>,
): Rental {
  const scooter = r.scooterId != null ? scootersById.get(r.scooterId) : null;
  const start = splitIsoDateTime(r.startAt);
  const endPlanned = splitIsoDateTime(r.endPlannedAt);
  const endActual = r.endActualAt ? splitIsoDateTime(r.endActualAt) : null;

  return {
    id: r.id,
    clientId: r.clientId,
    scooterId: r.scooterId ?? undefined,
    scooter: scooter?.name ?? "—",
    model: scooter?.model ?? "jog",
    start: start.date,
    startTime: start.time,
    endPlanned: endPlanned.date,
    endActual: endActual?.date,
    status: r.status,
    sourceChannel: r.sourceChannel ?? undefined,
    tariffPeriod: r.tariffPeriod,
    rate: r.rate,
    rateUnit: r.rateUnit ?? "day",
    days: r.days,
    sum: r.sum,
    deposit: r.deposit,
    depositReturned: r.depositReturned ?? undefined,
    equipment: r.equipment,
    // v0.4.70: equipmentJson маппился ранее ТОЛЬКО для legacy через
    // r.equipment (массив строк). API возвращает структурированный
    // r.equipmentJson — без маппинга он терялся, и фронт думал что
    // у аренды экипировки нет: «Изменить экипировку» показывало
    // «Без экипировки», окно «Завершить аренду» не рисовало карточки,
    // расчёт delta в EquipmentChangeDialog всегда шёл от oldDaily=0.
    equipmentJson: r.equipmentJson ?? [],
    paymentMethod: r.paymentMethod,
    note: r.note ?? undefined,
    contractUploaded: r.contractUploaded,
    // v0.5: поля paymentConfirmedBy/Name/At удалены из API (упростили
    // модель статусов). Подтверждение оплаты в UI больше не отображается —
    // TODO Phase 2: переработать карточку аренды.
    paymentConfirmed: null,
    damageAmount: r.damageAmount ?? undefined,
    parentRentalId: r.parentRentalId ?? undefined,
    archivedAt: r.archivedAt ?? null,
    archivedBy: r.archivedBy ?? null,
  };
}
