/**
 * Утилиты форматирования и валидации для публичной формы анкеты.
 * Дублируют логику из AddClientModal.tsx — намеренно изолированы,
 * чтобы публичная форма не тащила за собой store/моки CRM.
 */

export function formatPhone(v: string): string {
  const digits = v.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  const d = digits.startsWith("8") || digits.startsWith("7") ? digits : "7" + digits;
  const p = d.slice(0, 11);
  const parts = [
    "+7",
    p.slice(1, 4) && ` (${p.slice(1, 4)}`,
    p.slice(4, 7) && `) ${p.slice(4, 7)}`,
    p.slice(7, 9) && `-${p.slice(7, 9)}`,
    p.slice(9, 11) && `-${p.slice(9, 11)}`,
  ].filter(Boolean);
  return parts.join("");
}

export function formatDateRu(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
}

export function formatDivisionCode(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 6);
  if (d.length <= 3) return d;
  return `${d.slice(0, 3)}-${d.slice(3)}`;
}

/** ДД.ММ.ГГГГ → ISO YYYY-MM-DD. null если невалидно. */
export function dateRuToIso(s: string): string | null {
  const m = s.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo}-${d}`;
}

/** ISO YYYY-MM-DD → ДД.ММ.ГГГГ для отображения. */
export function isoToDateRu(s: string | null | undefined): string {
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y}`;
}

export function nullableTrim(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  return t === "" ? null : t;
}

export function validateName(v: string): string | null {
  const parts = v.trim().split(/\s+/);
  if (parts.length < 2 || !parts[0] || !parts[1])
    return "Нужно минимум Имя и Фамилия";
  return null;
}

export function validatePhone(v: string): string | null {
  const digits = v.replace(/\D/g, "");
  if (digits.length !== 11) return "Введите 11 цифр телефона";
  return null;
}

export function validateBirth(v: string): string | null {
  const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return "Формат ДД.ММ.ГГГГ";
  const [, d, mo, y] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  const today = new Date();
  const age = today.getFullYear() - date.getFullYear();
  if (age < 18) return "Должно быть 18 лет или больше";
  if (age > 100) return "Проверьте дату рождения";
  return null;
}

export function validateSeries(v: string): string | null {
  if (!/^\d{4}$/.test(v)) return "4 цифры";
  return null;
}

export function validatePassportNumber(v: string): string | null {
  if (!/^\d{6}$/.test(v)) return "6 цифр";
  return null;
}
