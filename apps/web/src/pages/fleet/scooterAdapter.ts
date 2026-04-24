import type { FleetScooter } from "@/lib/mock/fleet";
import type { ApiScooter } from "@/lib/api/types";

/** "2026-04-15" → "15.04.2026" */
function isoDateToRu(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export function adaptScooter(a: ApiScooter): FleetScooter {
  return {
    id: a.id,
    name: a.name,
    model: a.model,
    modelId: a.modelId ?? undefined,
    mileage: a.mileage,
    baseStatus: a.baseStatus,
    vin: a.vin ?? undefined,
    engineNo: a.engineNo ?? undefined,
    frameNumber: a.frameNumber ?? undefined,
    year: a.year ?? undefined,
    color: a.color ?? undefined,
    purchaseDate: isoDateToRu(a.purchaseDate),
    purchasePrice: a.purchasePrice ?? undefined,
    lastOilChangeMileage: a.lastOilChangeMileage ?? undefined,
    note: a.note ?? undefined,
  };
}
