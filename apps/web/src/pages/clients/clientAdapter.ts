import type { Client } from "@/lib/mock/clients";
import type { ApiClient } from "@/lib/api/types";

/** "2026-04-03" → "03.04.26" (обратное представление для UI) */
function isoToRu(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]!.slice(2)}`;
}

/**
 * Адаптация ApiClient → UI-тип Client.
 *
 * `rents` и `debt` в реальной модели вычисляемые (denormalized).
 * Сейчас возвращаем 0 — в ближайшей итерации подсчитаем из аренд.
 * Влияет на: счётчик «N аренд» в списке + фильтр «С долгом».
 *
 * Паспортные данные/адрес/дата рождения/extraPhone пробрасываются
 * as-is — нужны UI-форме редактирования и карточке клиента, чтобы
 * показывать реальные данные из БД, а не прочерки от mock-фоллбэка.
 */
export function adaptClient(a: ApiClient): Client {
  return {
    id: a.id,
    name: a.name,
    phone: a.phone,
    rating: a.rating,
    rents: 0,
    debt: 0,
    source: a.source,
    added: isoToRu(a.addedOn),
    blacklisted: a.blacklisted,
    comment: a.comment ?? undefined,
    extraPhone: a.extraPhone,
    birthDate: a.birthDate,
    passportSeries: a.passportSeries,
    passportNumber: a.passportNumber,
    passportIssuedOn: a.passportIssuedOn,
    passportIssuer: a.passportIssuer,
    passportDivisionCode: a.passportDivisionCode,
    passportRegistration: a.passportRegistration,
    isForeigner: a.isForeigner,
    passportRaw: a.passportRaw,
    blacklistReason: a.blacklistReason,
    depositBalance: a.depositBalance ?? 0,
  };
}
