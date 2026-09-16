import type { ApiScooter } from "@/lib/api/types";

/**
 * Мастер «Новая техника» (релиз 2.0.1): данные черновика, проверки строк
 * и разбор вставки из Excel. Без React — чтобы логику было легко проверить.
 */

export type Category = "rental" | "sale" | "buyout" | "unassigned";
export type RentalState = "rental_pool" | "repair" | "dtp" | "disassembly";

/** Статус единицы по категории. */
export function statusOf(category: Category, rentalState: RentalState): ApiScooter["baseStatus"] {
  if (category === "rental") return rentalState;
  if (category === "sale") return "for_sale";
  if (category === "buyout") return "buyout";
  return "ready";
}

/** Статусы, в которых технике выдаётся арендный номер. */
export function holdsSlot(status: string): boolean {
  return status === "rental_pool" || status === "repair" || status === "dtp";
}

/** Одна единица партии. Пустая строка = «как у всех». */
export type UnitRow = {
  key: string;
  vin: string;
  engineNo: string;
  year: string;
  color: string;
  mileage: string;
  /** Цена продажи (продажа) или рыночная стоимость (остальные категории). */
  price: string;
  note: string;
  /** Арендный номер; null — первый свободный. */
  slot: number | null;
};

/** «Для всех» — подставляется в пустые ячейки. */
export type CommonValues = {
  year: string;
  color: string;
  mileage: string;
  price: string;
  note: string;
};

export type Draft = {
  step: 0 | 1 | 2 | 3;
  category: Category | null;
  modelId: number | null;
  count: number;
  batch: string;
  purchaseDate: string;
  purchasePrice: string;
  rentalState: RentalState;
  investorId: number | null;
  common: CommonValues;
  rows: UnitRow[];
  savedAt: number;
};

export const MAX_UNITS = 50;

let seq = 0;
export function newRow(): UnitRow {
  seq += 1;
  return {
    key: `${Date.now().toString(36)}-${seq}`,
    vin: "",
    engineNo: "",
    year: "",
    color: "",
    mileage: "",
    price: "",
    note: "",
    slot: null,
  };
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function emptyDraft(category: Category | null = null): Draft {
  return {
    step: 0,
    category,
    modelId: null,
    count: 1,
    batch: "",
    purchaseDate: todayIso(),
    purchasePrice: "",
    rentalState: "rental_pool",
    investorId: null,
    common: { year: "", color: "", mileage: "", price: "", note: "" },
    rows: [newRow()],
    savedAt: Date.now(),
  };
}

/** Черновик стоит восстанавливать, только если в нём что-то введено. */
export function draftHasData(d: Draft): boolean {
  return (
    d.step > 0 ||
    d.batch.trim() !== "" ||
    d.rows.some((r) => r.vin || r.engineNo || r.note || r.price || r.slot != null)
  );
}

/** Изменить число строк, не теряя уже введённое в оставшихся. */
export function resizeRows(rows: UnitRow[], count: number): UnitRow[] {
  const n = Math.max(1, Math.min(MAX_UNITS, Math.round(count) || 1));
  if (rows.length === n) return rows;
  if (rows.length > n) return rows.slice(0, n);
  const next = [...rows];
  while (next.length < n) next.push(newRow());
  return next;
}

export function rowHasData(r: UnitRow): boolean {
  return !!(r.vin || r.engineNo || r.year || r.color || r.mileage || r.price || r.note || r.slot != null);
}

/**
 * Номер рамы: заглавные, без пробелов. Кириллица, похожая на латиницу
 * (набрали в русской раскладке), переводится в латиницу — иначе «С» и «C»
 * дали бы две разные рамы и проверка на дубль её пропустила бы.
 */
const LOOKALIKE: Record<string, string> = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P",
  С: "C", Т: "T", У: "Y", Х: "X",
};
export function normalizeVin(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[АВЕКМНОРСТУХ]/g, (ch) => LOOKALIKE[ch] ?? ch)
    .slice(0, 20);
}

/** Цифры из строки; пусто → "". */
export function digitsOnly(raw: string, max = 9): string {
  return raw.replace(/\D/g, "").slice(0, max);
}

/** Итоговые значения строки с учётом «для всех». */
export function resolveRow(r: UnitRow, c: CommonValues) {
  const pick = (own: string, common: string) => (own.trim() !== "" ? own.trim() : common.trim());
  return {
    vin: r.vin.trim(),
    engineNo: r.engineNo.trim(),
    year: pick(r.year, c.year),
    color: pick(r.color, c.color),
    mileage: pick(r.mileage, c.mileage),
    price: pick(r.price, c.price),
    note: pick(r.note, c.note),
  };
}

export type RowIssue = { field: keyof UnitRow; message: string; blocking: boolean };

export type FleetVinInfo = { label: string; where: "" | "archive" };

export function validateRows(opts: {
  rows: UnitRow[];
  common: CommonValues;
  fleetVins: Map<string, FleetVinInfo>;
  holds: boolean;
  freeSlots: number[];
  slotsTotal: number;
}): Map<string, RowIssue[]> {
  const { rows, common, fleetVins, holds, freeSlots, slotsTotal } = opts;
  const out = new Map<string, RowIssue[]>();
  const add = (key: string, issue: RowIssue) => {
    const list = out.get(key) ?? [];
    list.push(issue);
    out.set(key, list);
  };
  const maxYear = new Date().getFullYear() + 1;
  const firstVin = new Map<string, number>();
  const firstSlot = new Map<number, number>();
  const freeSet = new Set(freeSlots);

  rows.forEach((r, i) => {
    const v = resolveRow(r, common);
    if (v.vin) {
      const first = firstVin.get(v.vin);
      if (first != null) {
        add(r.key, { field: "vin", message: `Повтор: такая же рама в строке ${first + 1}`, blocking: true });
      } else {
        firstVin.set(v.vin, i);
        const f = fleetVins.get(v.vin);
        if (f) {
          add(r.key, {
            field: "vin",
            message: f.where === "archive" ? `Уже есть в архиве: ${f.label}` : `Уже есть в парке: ${f.label}`,
            blocking: true,
          });
        }
      }
      if (v.vin.length < 5) {
        add(r.key, { field: "vin", message: "Слишком короткий номер рамы", blocking: false });
      }
    } else {
      add(r.key, { field: "vin", message: "Без номера рамы — не попадёт в акты и договоры", blocking: false });
    }
    if (v.year) {
      const y = Number(v.year);
      if (!Number.isInteger(y) || y < 1980 || y > maxYear) {
        add(r.key, { field: "year", message: `Год — от 1980 до ${maxYear}`, blocking: true });
      }
    }
    if (holds && r.slot != null) {
      const first = firstSlot.get(r.slot);
      if (first != null) {
        add(r.key, { field: "slot", message: `Номер ${r.slot} уже выбран в строке ${first + 1}`, blocking: true });
      } else {
        firstSlot.set(r.slot, i);
        if (r.slot > slotsTotal) {
          add(r.key, { field: "slot", message: `Номеров всего ${slotsTotal}`, blocking: true });
        } else if (!freeSet.has(r.slot)) {
          add(r.key, { field: "slot", message: `Номер ${r.slot} уже занят`, blocking: true });
        }
      }
    }
  });
  return out;
}

/**
 * Арендные номера строк: выбранные вручную + первые свободные по порядку.
 * null — номера не хватило.
 */
export function assignSlots(rows: UnitRow[], freeSlots: number[]): (number | null)[] {
  const explicit = new Set(rows.map((r) => r.slot).filter((x): x is number => x != null));
  const pool = freeSlots.filter((n) => !explicit.has(n));
  let k = 0;
  return rows.map((r) => (r.slot != null ? r.slot : (pool[k++] ?? null)));
}

/** «71, 72, 73, 75» → «71–73, 75». */
export function formatRanges(nums: number[]): string {
  const s = [...new Set(nums)].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < s.length) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j]! + 1) j++;
    parts.push(j - i >= 2 ? `${s[i]}–${s[j]}` : s.slice(i, j + 1).join(", "));
    i = j + 1;
  }
  return parts.join(", ");
}

/**
 * Вставка из Excel/Google-таблицы: строки — через перевод строки,
 * ячейки — через Tab (или «;», если набирали руками). Пустые строки в конце
 * отбрасываются.
 */
export function parseGrid(text: string): string[][] {
  const lines = text.replace(/\r/g, "").split("\n");
  while (lines.length && lines[lines.length - 1]!.trim() === "") lines.pop();
  return lines.map((line) => {
    const sep = line.includes("\t") ? "\t" : line.includes(";") ? ";" : null;
    return (sep ? line.split(sep) : [line]).map((c) => c.trim());
  });
}

export function looksLikeGrid(text: string): boolean {
  const t = text.replace(/\r/g, "").replace(/\n+$/, "");
  return t.includes("\n") || t.includes("\t");
}

export function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

export function fmtMoney(n: number): string {
  return `${n.toLocaleString("ru-RU")} ₽`;
}
