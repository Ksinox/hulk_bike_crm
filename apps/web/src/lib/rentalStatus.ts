/**
 * Единый расчёт «эффективного» статуса аренды для отображения.
 *
 * В БД status='active' остаётся пока оператор не сделает явное действие
 * (продлит/завершит/сменит вручную). С v0.4.34 есть scheduler который
 * раз в час переводит active→overdue, но между тиками в БД ещё может
 * быть неактуальный 'active'. Поэтому UI всегда считает effective.
 *
 * Логика:
 *   - status='active' + endPlanned в прошлом  → 'overdue' (красный)
 *   - status='active' + endPlanned = сегодня  → 'returning' (оранжевый)
 *   - все остальные статусы возвращаются как есть.
 *
 * Используется в:
 *   - apps/web/src/pages/rentals/RentalsList.tsx
 *   - apps/web/src/pages/rentals/RentalCard.tsx
 *   - apps/web/src/pages/dashboard/DashboardDrawer.tsx
 *   - apps/web/src/pages/clients/ClientCardTabs.tsx
 *   - apps/web/src/pages/dashboard/RevenueRentalsList.tsx
 *   - apps/web/src/pages/fleet/ScooterCard.tsx
 *
 * Принимает endPlanned либо в формате "DD.MM.YYYY" (Rental), либо в
 * ISO формате (ApiRental.endPlannedAt). Универсальный детектор формата.
 */
import type { RentalStatus } from "@/lib/mock/rentals";

const todayKey = (now = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

export function effectiveRentalStatus(
  status: RentalStatus,
  endPlanned: string | null | undefined,
  /** v0.4.53: фактический долг по этой аренде (опциональный).
   *  Если передан и >0 — рассматриваем endPlanned-в-прошлом как
   *  настоящую просрочку (overdue). Если 0 — клиент закрыл вопрос
   *  (forgive/payment), плашка просрочки и бейдж скрываются —
   *  показываем «returning» (ожидаем возврата) или 'active'. */
  totalDebt?: number,
  now: Date = new Date(),
): RentalStatus {
  // v0.4.71: расширили обработку — раньше функция работала только при
  // status='active'. Теперь если в БД status='overdue' (поставлен
  // scheduler'ом) и долг=0 (клиент всё погасил / простили) —
  // нормализуем в UI: returning если endPlanned <= today, active иначе.
  // Бэк-нормализация status в БД делается отдельно в API /debt.
  if (status === "overdue" && totalDebt !== undefined && totalDebt <= 0) {
    if (!endPlanned) return "active";
    let endKey: string | null = null;
    const ru = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(endPlanned);
    if (ru) endKey = `${ru[3]}-${ru[2]}-${ru[1]}`;
    else if (/^\d{4}-\d{2}-\d{2}/.test(endPlanned))
      endKey = endPlanned.slice(0, 10);
    if (!endKey) return "active";
    const today = todayKey(now);
    if (endKey < today) return "returning";
    if (endKey === today) return "returning";
    return "active";
  }
  if (status !== "active") return status;
  if (!endPlanned) return status;
  let endKey: string | null = null;
  const ru = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(endPlanned);
  if (ru) {
    endKey = `${ru[3]}-${ru[2]}-${ru[1]}`;
  } else if (/^\d{4}-\d{2}-\d{2}/.test(endPlanned)) {
    endKey = endPlanned.slice(0, 10);
  }
  if (!endKey) return status;
  const today = todayKey(now);
  if (endKey < today) {
    // v0.4.53: если долг по аренде 0 (всё погашено / прощено) —
    // НЕ показываем красную просрочку. Меняем на 'returning'
    // (амбер «ожидаем возврата») — клиент должен вернуть скутер,
    // но штрафных начислений нет.
    if (totalDebt !== undefined && totalDebt <= 0) return "returning";
    return "overdue";
  }
  if (endKey === today) return "returning";
  return status;
}
