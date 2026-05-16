/**
 * v0.8 — Сортировка должников по приоритету.
 *
 * Правило владельца (см. Должники.md):
 *   1) Сумма — больше выше (DESC)
 *   2) Психо-портрет — меньше (сложнее клиент) → выше (ASC)
 *   3) Статус клиента — closed (нет точек давления) → выше
 */

import { isClosed, type Stage } from "./debtorStages.js";

export type DebtorForPriority = {
  id: number;
  totalAmount: number;
  psyRating: number; // 1..5
  clientStatus: "active" | "closed";
  stage: Stage;
};

/**
 * Возвращает кортеж для сортировки. Меньшие значения → выше в списке.
 *  [0]  -totalAmount   (для DESC через числовое сравнение)
 *  [1]  psyRating      (ASC: 1=сложный=выше)
 *  [2]  status weight  (closed=0, active=1)
 */
export function priorityScore(d: DebtorForPriority): [number, number, number] {
  return [
    -d.totalAmount,
    d.psyRating,
    d.clientStatus === "closed" ? 0 : 1,
  ];
}

/**
 * Возвращает массив, отсортированный по приоритету. Закрытые дела
 * (closed_*) исключаются — они в архиве и не должны попадать в очередь.
 *
 * Если нужны и закрытые тоже (для админских отчётов) — пропусти их
 * фильтрацию через `includeClosed=true`.
 */
export function sortByPriority<T extends DebtorForPriority>(
  debtors: T[],
  options: { includeClosed?: boolean } = {},
): T[] {
  const filtered = options.includeClosed
    ? debtors
    : debtors.filter((d) => !isClosed(d.stage));
  return [...filtered].sort((a, b) => {
    const sa = priorityScore(a);
    const sb = priorityScore(b);
    return sa[0] - sb[0] || sa[1] - sb[1] || sa[2] - sb[2];
  });
}

/**
 * Возвращает первого (самого приоритетного) — для hero-карточки на «Утре».
 */
export function topPriority<T extends DebtorForPriority>(debtors: T[]): T | null {
  const sorted = sortByPriority(debtors);
  return sorted[0] ?? null;
}
