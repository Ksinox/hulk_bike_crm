/**
 * Утилиты текстового поиска — единые правила для всех списков.
 *
 * Цели:
 * 1. "47" в списке аренд НЕ должен матчить id 147, 247 — только точное 47.
 * 2. "47" в названии скутера "Jog #47" — должен матчить точно по номеру.
 * 3. Телефон ищется только если в запросе 4+ цифр подряд (чтобы "47" не
 *    матчил "+7 (916) 447-...").
 * 4. Фамилии/имена — подстрока в lower-case.
 */

export type Query = {
  /** lower-case trim */
  text: string;
  /** только цифры из запроса (подряд) */
  digits: string;
  /** запрос — только число (напр. "47", "121") */
  isNumeric: boolean;
};

export function normalizeQuery(raw: string): Query {
  const text = raw.toLowerCase().trim();
  const digits = (raw.match(/\d+/g) ?? []).join("");
  const isNumeric = /^\d+$/.test(text);
  return { text, digits, isNumeric };
}

/**
 * Пользователь ввёл число → считаем это как поиск по ID или по номеру скутера.
 * Короткое число (1–3 цифры) матчим только точно (=== "47"), не подстрокой
 * (иначе 47 совпадёт с 147, 247, 470, 1047…).
 * Длинное число (4+ цифр) — подстрока ок, обычно это фрагмент длинного id.
 */
export function matchId(id: number | string, q: Query): boolean {
  if (!q.isNumeric || q.digits.length === 0) return false;
  const s = String(id);
  if (q.digits.length >= 4) return s.includes(q.digits);
  return s === q.digits;
}

/** Номер скутера из "Jog #47" → "47". Если номера нет — null. */
export function extractScooterNumber(name: string): string | null {
  const m = name.match(/#\s*(\d+)/);
  return m ? m[1] : null;
}

/**
 * Имя скутера. Для чисто-числового запроса "47" матчим **только** по номеру
 * скутера (после #), не по подстроке всего имени.
 * Для текстового запроса "jog" — обычная подстрока.
 */
export function matchScooterName(name: string | undefined, q: Query): boolean {
  if (!name || q.text.length === 0) return false;
  if (q.isNumeric) {
    const num = extractScooterNumber(name);
    if (!num) return false;
    return q.digits.length >= 4 ? num.includes(q.digits) : num === q.digits;
  }
  return name.toLowerCase().includes(q.text);
}

/**
 * Модель, как её называют вслух: «айма 01», «джог 5». Ключ — то, что есть
 * в названии скутера латиницей.
 */
const MODEL_ALIASES: Array<[RegExp, string]> = [
  [/^(айма|аима|aima)$/, "aima"],
  [/^(джог|жог|jog)$/, "jog"],
  [/^(гир|гиар|gear)$/, "gear"],
  [/^(дио|dio)$/, "dio"],
  [/^(танк|tank)$/, "tank"],
  [/^(вино|vino)$/, "vino"],
  [/^(ау01|ay01)$/, "ay01"],
];

export type ScooterNumberQuery = {
  number: number;
  /** Модель из запроса латиницей («aima»), если её назвали. */
  model: string | null;
  /** «бывший 80» — искать только бывший номер. */
  former: boolean;
};

/**
 * Запрос по номеру скутера (15.09): «5», «05», «№5», «#5», «номер 5»,
 * «айма 01», «jog5», «бывший 80». Номер — до трёх цифр, иначе это VIN,
 * рама или телефон. null — в запросе не номер.
 */
export function parseScooterNumberQuery(raw: string): ScooterNumberQuery | null {
  let s = raw.toLowerCase().replace(/ё/g, "е").trim();
  if (!s) return null;
  let former = false;
  const fm = s.match(/^бывш\S*\s*/);
  if (fm) {
    former = true;
    s = s.slice(fm[0].length);
  }
  s = s.replace(/(^|\s)(номер|ном\.?)(\s|$)/g, " ").trim();
  const m = s.match(/^(?:([a-zа-я][a-zа-я0-9]*?)\s*)?[№#]?\s*0*(\d{1,3})$/);
  if (!m) return null;
  const number = Number(m[2]);
  if (!Number.isFinite(number) || (number === 0 && !/0/.test(m[2]))) return null;
  let model: string | null = null;
  if (m[1]) {
    const word = m[1];
    model = MODEL_ALIASES.find(([re]) => re.test(word))?.[1] ?? word;
  }
  return { number, model, former };
}

/**
 * Совпал ли скутер с запросом по номеру:
 *   "current" — действующий номер;
 *   "former"  — бывший номер (техника вне аренды);
 *   "name"    — номер из названия («aima #01» при действующем №68): вслух
 *               скутер называют так, как написано на нём.
 */
export function matchScooterNumber(
  s: {
    name?: string | null;
    rentalSlot?: number | null;
    exRentalSlot?: number | null;
  },
  q: ScooterNumberQuery,
  modelLabel?: string,
): "current" | "former" | "name" | null {
  if (q.model) {
    const hay = `${s.name ?? ""} ${modelLabel ?? ""}`.toLowerCase();
    if (!hay.includes(q.model)) return null;
  }
  if (!q.former && s.rentalSlot != null && s.rentalSlot === q.number) return "current";
  if (s.rentalSlot == null && s.exRentalSlot != null && s.exRentalSlot === q.number) {
    return "former";
  }
  if (q.former) return null;
  const inName = s.name ? extractScooterNumber(s.name) : null;
  if (inName != null && Number(inName) === q.number) return "name";
  return null;
}

/** Телефон ищется только когда в запросе ≥4 цифр подряд. Иначе false. */
export function matchPhone(phone: string | undefined, q: Query): boolean {
  if (!phone || q.digits.length < 4) return false;
  return phone.replace(/\D/g, "").includes(q.digits);
}

/** Обычная подстрока в lower-case. Пустой запрос → false. */
export function matchText(value: string | undefined, q: Query): boolean {
  if (!value || q.text.length === 0) return false;
  return value.toLowerCase().includes(q.text);
}

/**
 * Ранг совпадения для сортировки (чем меньше — тем выше).
 * 0 — точное, 1 — префикс, 2 — подстрока, 999 — нет.
 */
export function rankTextMatch(value: string | undefined, q: Query): number {
  if (!value || q.text.length === 0) return 999;
  const v = value.toLowerCase();
  if (v === q.text) return 0;
  if (v.startsWith(q.text)) return 1;
  if (v.includes(q.text)) return 2;
  return 999;
}
