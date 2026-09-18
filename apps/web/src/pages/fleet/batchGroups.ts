import type { ApiScooter } from "@/lib/api/types";

/**
 * Где сейчас единица партии — общие подписи для «Партий» и окна правки
 * партии (2.0.3).
 */
export type Group = "sale" | "sold" | "rent" | "buyout" | "other" | "archive";

export const GROUP_LABEL: Record<Group, string> = {
  sale: "На витрине",
  sold: "Продано",
  rent: "В аренде",
  buyout: "В выкупе",
  other: "Не распределены",
  archive: "В архиве",
};

export const GROUP_TONE: Record<Group, string> = {
  sale: "bg-emerald-50 text-emerald-800",
  sold: "bg-blue-50 text-blue-800",
  rent: "bg-surface-soft text-ink-2",
  buyout: "bg-purple-soft text-purple-ink",
  other: "bg-surface-soft text-muted",
  archive: "bg-surface-soft text-muted-2",
};

export function groupOf(s: ApiScooter): Group {
  if (s.baseStatus === "sold") return "sold";
  if (s.archivedAt) return "archive";
  if (s.baseStatus === "for_sale") return "sale";
  if (s.baseStatus === "buyout") return "buyout";
  if (s.baseStatus === "rental_pool" || s.baseStatus === "repair" || s.baseStatus === "dtp") return "rent";
  return "other";
}

/** Статус единицы словами — в строке партии и в окне правки. */
export const UNIT_STATUS_LABEL: Record<string, string> = {
  ready: "Не распределена",
  rental_pool: "В аренде",
  repair: "На ремонте",
  dtp: "ДТП",
  disassembly: "В разборке",
  for_sale: "На витрине",
  sold: "Продана",
  buyout: "В выкупе",
};

/** Опознать единицу без арендного номера: рама, иначе цвет и год. */
export function unitHint(s: ApiScooter): string {
  const bits = [s.vin || "без рамы", s.color || null, s.year ? String(s.year) : null].filter(Boolean);
  return bits.join(" · ");
}
