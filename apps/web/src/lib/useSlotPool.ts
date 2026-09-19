import { useCallback, useMemo } from "react";
import { useApiScooters } from "@/lib/api/scooters";

/**
 * Ряд арендного номера техники — бензин или электро (правки 7.0, п.5).
 *
 * Номер хранится у техники вместе с рядом (`slotPool`): у электро своя
 * нумерация с 1, кружок номера зелёный. Здесь ряд ищется по технике или по
 * её имени — там, где на руках только строка («Jog #03» из аренды).
 */
export type SlotPoolRef =
  | { slotPool?: "petrol" | "electric" | null }
  | string
  | null
  | undefined;

export function useSlotPoolOf(): (s: SlotPoolRef) => "petrol" | "electric" {
  const { data: scooters = [] } = useApiScooters();
  const byName = useMemo(() => {
    const m = new Map<string, "petrol" | "electric">();
    for (const s of scooters) m.set(s.name, s.slotPool === "electric" ? "electric" : "petrol");
    return m;
  }, [scooters]);
  return useCallback(
    (s: SlotPoolRef) => {
      if (!s) return "petrol";
      if (typeof s === "string") return byName.get(s) ?? "petrol";
      return s.slotPool === "electric" ? "electric" : "petrol";
    },
    [byName],
  );
}
