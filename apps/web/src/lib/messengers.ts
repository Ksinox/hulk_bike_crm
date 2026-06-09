/**
 * Прямые ссылки на чат в мессенджере ПО НОМЕРУ телефона — открывают переписку
 * с человеком БЕЗ добавления его в контакты (как whapp.info, но штатными
 * средствами WhatsApp/Telegram).
 *
 *  • WhatsApp:  https://wa.me/<цифры>?text=…        (click-to-chat)
 *  • Telegram:  https://t.me/+<цифры>?text=…        (resolve по номеру)
 *
 * Оба — обычные https-ссылки: в браузере открывается веб/приложение, на
 * телефоне — приложение. Номер приводим к международному виду (только цифры,
 * российскую «8…» меняем на «7…»).
 */

/** Только цифры международного формата (РФ: ведущую 8 → 7). */
export function phoneDigits(phone: string | null | undefined): string {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  return d;
}

/** Чат WhatsApp по номеру (без сохранения контакта). Пусто, если номер пуст. */
export function whatsappLink(phone: string, text?: string): string {
  const d = phoneDigits(phone);
  if (!d) return "";
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${d}${q}`;
}

/** Чат Telegram по номеру (без сохранения контакта). Пусто, если номер пуст. */
export function telegramLink(phone: string, text?: string): string {
  const d = phoneDigits(phone);
  if (!d) return "";
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://t.me/+${d}${q}`;
}
