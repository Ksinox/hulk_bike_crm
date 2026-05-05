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
  now: Date = new Date(),
): RentalStatus {
  if (status !== "active") return status;
  if (!endPlanned) return status;
  // ISO: "2026-05-05T18:03:00+03:00" или "2026-05-05" → берём первые 10
  // символов как YYYY-MM-DD ключ
  // RU: "DD.MM.YYYY" → конвертируем в YYYY-MM-DD
  let endKey: string | null = null;
  const ru = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(endPlanned);
  if (ru) {
    endKey = `${ru[3]}-${ru[2]}-${ru[1]}`;
  } else if (/^\d{4}-\d{2}-\d{2}/.test(endPlanned)) {
    endKey = endPlanned.slice(0, 10);
  }
  if (!endKey) return status;
  const today = todayKey(now);
  if (endKey < today) return "overdue";
  if (endKey === today) return "returning";
  return status;
}
