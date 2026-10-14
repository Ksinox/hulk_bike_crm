/**
 * Порядок техники в списках — по АРЕНДНОМУ номеру (кружок у модели).
 *
 * Правка заказчика 13.10: «сортировку по номерам скутеров». Раньше списки
 * шли по имени: на компьютере — по старой «решётке» («Jog #39» с номером 70
 * стоял между 40 и 38), на телефоне и планшете — по алфавиту модели: сначала
 * все Gear, потом все Jog. Gear №24 стоял среди Gear, а в ряду Jog после 20
 * сразу шёл 27 — со стороны казалось, что скутера №24 в списке нет.
 *
 * Порядок: бензиновые 1, 2, 3… → электро 1, 2, 3… (у них своя нумерация)
 * → техника без номера: сначала по бывшему номеру, потом по имени.
 */
export type RentalNumbered = {
  name: string;
  rentalSlot?: number | null;
  slotPool?: "petrol" | "electric" | null;
  exRentalSlot?: number | null;
};

/** Ряд: 0 — бензин с номером, 1 — электро с номером, 2 — без номера. */
function row(s: RentalNumbered): number {
  if (s.rentalSlot == null) return 2;
  return s.slotPool === "electric" ? 1 : 0;
}

export function compareByRentalNumber(
  a: RentalNumbered,
  b: RentalNumbered,
  dir: "asc" | "desc" = "asc",
): number {
  const r = row(a) - row(b);
  if (r !== 0) return r;
  const na = a.rentalSlot ?? a.exRentalSlot ?? null;
  const nb = b.rentalSlot ?? b.exRentalSlot ?? null;
  if (na != null && nb != null && na !== nb) return dir === "desc" ? nb - na : na - nb;
  if (na != null && nb == null) return -1;
  if (na == null && nb != null) return 1;
  return a.name.localeCompare(b.name, "ru", { numeric: true });
}
