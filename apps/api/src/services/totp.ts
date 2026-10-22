import crypto from "node:crypto";

/**
 * 22.10 — меняющийся код директора (как в Google Authenticator).
 *
 * Стандарт RFC 6238 (TOTP): секрет живёт ТОЛЬКО на сервере, код =
 * HMAC-SHA1(секрет, номер 30-секундного окна) → 6 цифр. Сервер считает код
 * сам и отдаёт его только в аккаунт директора; оператор вводит то, что ему
 * продиктовали. Через 30 секунд код другой — сохранённый браузером бесполезен.
 */

export const TOTP_PERIOD_S = 30;
const DIGITS = 6;

/** Новый секрет: 20 случайных байт в hex (хранится в app_settings, скрыт). */
export function newTotpSecret(): string {
  return crypto.randomBytes(20).toString("hex");
}

/** Номер 30-секундного окна для момента времени. */
export function totpStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_S);
}

/** Код окна (RFC 4226, динамическое усечение). */
export function totpCode(secretHex: string, step: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac("sha1", Buffer.from(secretHex, "hex")).update(buf).digest();
  const off = h[h.length - 1]! & 0x0f;
  const bin =
    ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Какое окно подходит под введённый код: текущее или предыдущее (код
 * диктуют по телефону — он мог смениться, пока его вводили). null — нет.
 */
export function matchTotp(secretHex: string, code: string, nowMs = Date.now()): number | null {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== DIGITS) return null;
  const cur = totpStep(nowMs);
  for (const step of [cur, cur - 1]) {
    const expected = totpCode(secretHex, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return step;
  }
  return null;
}
