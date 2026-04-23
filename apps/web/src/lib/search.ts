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
