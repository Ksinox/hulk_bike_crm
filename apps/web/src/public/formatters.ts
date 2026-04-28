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

/**
 * Автоформат даты ДД.ММ.ГГГГ с защитой от невозможных значений.
 *  - День: блокируется ввод первой цифры > 3 (нет дней 40+).
 *  - Месяц: блокируется первая цифра > 1 (нет 13-го месяца).
 *  - Если уже введено `31` дня и сверху подбирается 2-я цифра > 1 (т.е. дату
 *    32 не получить), просто дропаем последнюю цифру.
 *  - Год: не валидируем диапазон побуквенно (он определяется только на
 *    4-й цифре), но `validateBirth`/`validateDate` отбракуют невалидные
 *    комбинации (несуществующая дата, будущая дата, < 1900 и т.п.).
 */
export function formatDateRu(v: string): string {
  const raw = v.replace(/\D/g, "").slice(0, 8);
  let out = "";

  // День
  if (raw.length >= 1) {
    const d1 = raw[0];
    if (parseInt(d1, 10) > 3) {
      // первая цифра дня не может быть > 3 — игнорируем
      return "";
    }
    out = d1;
  }
  if (raw.length >= 2) {
    const dd = raw.slice(0, 2);
    const ddNum = parseInt(dd, 10);
    if (ddNum < 1 || ddNum > 31) {
      // 00 или 32-39 — отбрасываем 2-ю цифру
      return out;
    }
    out = dd;
  }

  // Месяц
  if (raw.length >= 3) {
    const m1 = raw[2];
    if (parseInt(m1, 10) > 1) {
      // первая цифра месяца > 1 невозможна — игнор
      return out;
    }
    out = `${out}.${m1}`;
  }
  if (raw.length >= 4) {
    const mm = raw.slice(2, 4);
    const mmNum = parseInt(mm, 10);
    if (mmNum < 1 || mmNum > 12) {
      return out;
    }
    out = `${raw.slice(0, 2)}.${mm}`;
  }

  // Год
  if (raw.length >= 5) {
    out = `${raw.slice(0, 2)}.${raw.slice(2, 4)}.${raw.slice(4)}`;
  }

  return out;
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

/** Проверяет что строка ДД.ММ.ГГГГ описывает реальную календарную дату. */
function parseAndCheckDate(v: string): Date | null {
  const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dn = Number(d);
  const mn = Number(mo);
  const yn = Number(y);
  const date = new Date(yn, mn - 1, dn);
  // new Date(2000, 1, 30) автоматически переедет на 1 марта — ловим это.
  if (
    date.getFullYear() !== yn ||
    date.getMonth() !== mn - 1 ||
    date.getDate() !== dn
  ) {
    return null;
  }
  return date;
}

export function validateBirth(v: string): string | null {
  const date = parseAndCheckDate(v);
  if (!date) {
    if (v.length < 10) return "Формат ДД.ММ.ГГГГ";
    return "Такой даты не существует";
  }
  const today = new Date();
  const age = today.getFullYear() - date.getFullYear();
  if (date > today) return "Дата рождения в будущем";
  if (age < 18) return "Должно быть 18 лет или больше";
  if (age > 100) return "Проверьте год рождения";
  return null;
}

/** Валидация даты выдачи паспорта/ВУ — не в будущем, не раньше 1900. */
export function validatePastDate(v: string): string | null {
  const date = parseAndCheckDate(v);
  if (!date) {
    if (v.length < 10) return "Формат ДД.ММ.ГГГГ";
    return "Такой даты не существует";
  }
  const today = new Date();
  if (date > today) return "Дата в будущем";
  if (date.getFullYear() < 1900) return "Слишком ранняя дата";
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
