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

/** Ряд номера: бензин и электро нумеруются раздельно, третий — без номера. */
export type NumberRow = "petrol" | "electric" | "none";

export function numberRow(s: RentalNumbered): NumberRow {
  if (s.rentalSlot == null) return "none";
  return s.slotPool === "electric" ? "electric" : "petrol";
}

/**
 * Ряды с подписями — для плиток парка (15.10, заказчик: «после 70 снова
 * 1, 2, 3 — непонятно»). Порядок рядов = порядок сортировки.
 */
export const NUMBER_ROWS: { key: NumberRow; label: string; hint?: string }[] = [
  { key: "petrol", label: "Бензин" },
  { key: "electric", label: "Электро" },
  { key: "none", label: "Без номера", hint: "вне арендного парка" },
];

const ROW_ORDER: Record<NumberRow, number> = { petrol: 0, electric: 1, none: 2 };
const row = (s: RentalNumbered) => ROW_ORDER[numberRow(s)];

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
