/**
 * Ссылка на анкету ПОКУПАТЕЛЯ (31.08).
 *
 * Та же публичная форма, но в режиме продажи: без выбора модели,
 * экипировки, срока аренды, водительских прав и инструктажа по прокату —
 * только паспорт, его фото и селфи. Режим задаётся параметром `p=sale`.
 */
export function saleFormUrl(): string {
  const base =
    (import.meta.env.VITE_PUBLIC_FORM_URL as string | undefined) ??
    (typeof window !== "undefined"
      ? `${window.location.origin}/#/apply`
      : "/#/apply");
  return base.includes("?") ? `${base}&p=sale` : `${base}?p=sale`;
}
