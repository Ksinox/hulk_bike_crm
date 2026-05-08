/**
 * Утилиты по приведению строкового регистра.
 *
 * Используем `toLocaleUpperCase('ru-RU')` чтобы корректно работать с
 * кириллицей: ё → Ё, й → Й. Стандартный `String.toUpperCase()`
 * по UCD это и так умеет, но локаль-вариант надёжнее на старых движках.
 */
export function toUpperRu(s: string): string {
  return s.toLocaleUpperCase("ru-RU");
}
