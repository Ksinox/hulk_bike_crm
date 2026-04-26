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
    days: r.days,
    sum: r.sum,
    deposit: r.deposit,
    depositReturned: r.depositReturned ?? undefined,
    equipment: r.equipment,
    paymentMethod: r.paymentMethod,
    note: r.note ?? undefined,
    contractUploaded: r.contractUploaded,
    paymentConfirmed:
      r.paymentConfirmedBy && r.paymentConfirmedByName && r.paymentConfirmedAt
        ? {
            // TODO: унифицировать enum. В API сейчас boss/manager, в UI —
            // director/admin. В следующей миграции переименуем в БД.
            by: r.paymentConfirmedBy === "boss" ? "director" : "admin",
            byName: r.paymentConfirmedByName,
            at: splitIsoDateTime(r.paymentConfirmedAt).date,
          }
        : null,
    damageAmount: r.damageAmount ?? undefined,
    parentRentalId: r.parentRentalId ?? undefined,
    archivedAt: r.archivedAt ?? null,
    archivedBy: r.archivedBy ?? null,
  };
}
