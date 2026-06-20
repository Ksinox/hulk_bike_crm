/**
 * Централизованная «Отмена» из тоста — единый механизм отката последнего
 * действия аренды для кнопки «Отменить» в тостах.
 *
 * ПРАВИЛО ДЛЯ ВСЕЙ CRM: любое ОТКАТЫВАЕМОЕ действие по аренде показываем через
 * `toastRentalDone(rental, ...)` вместо `toast.success(...)`. Тост сразу
 * получает кнопку «Отменить» (10 сек, полоса-таймер), завязанную на наш откат —
 * тот же движок, что и кнопка «Откатить» в хронологии. Новые откатываемые
 * операции добавляются сюда же — ничего больше прописывать не нужно.
 */
import { api, ApiError } from "@/lib/api";
import type { ListResponse } from "@/lib/api/types";
import type { ApiPayment } from "@/lib/api/payments";
import type { ApiActivityItem } from "@/lib/api/activity";
import { toast } from "@/lib/toast";
import {
  computeRollbackTarget,
  executeRollbackTarget,
  type RollbackRentalRef,
} from "./RollbackLastAction";

/**
 * Откатить ПОСЛЕДНЕЕ действие аренды (для тостовой «Отмены»). Тянет свежую
 * хронологию + платежи (действие только что совершено → оно и есть последнее
 * эффективное), вычисляет цель отката тем же `computeRollbackTarget`, что и
 * кнопка в таймлайне, и выполняет `executeRollbackTarget`. Если откатывать
 * нечего (истёк день / уже откатили) — мягкая ошибка; откат всё ещё доступен в
 * хронологии события.
 */
export async function undoLastRentalAction(
  rental: RollbackRentalRef,
): Promise<void> {
  try {
    const [actRes, paysRes] = await Promise.all([
      api.get<{ items: ApiActivityItem[] }>(
        `/api/activity/timeline?entity=rental&id=${rental.id}&limit=80`,
      ),
      api.get<ListResponse<ApiPayment>>(`/api/payments?rentalId=${rental.id}`),
    ]);
    const target = computeRollbackTarget(rental, actRes.items, paysRes.items);
    if (!target) {
      toast.error("Отменить не вышло", "Откат доступен в хронологии события");
      return;
    }
    await executeRollbackTarget(rental, target, { parkScope: "both" });
    toast.success("Действие отменено");
  } catch (e) {
    toast.error(
      "Не удалось отменить",
      e instanceof ApiError ? e.message : ((e as Error)?.message ?? ""),
    );
  }
}

/**
 * ЕДИНАЯ точка для тостов об успешной откатываемой операции по аренде.
 * Вместо `toast.success(title, message)` — `toastRentalDone(rental, title,
 * message)`: тост сразу с кнопкой «Отменить» (10 сек), завязанной на откат.
 */
export function toastRentalDone(
  rental: RollbackRentalRef,
  title: string,
  message?: string,
  opts?: { kind?: "success" | "info" | "warn" | "error" },
): void {
  toast.action({
    kind: opts?.kind,
    title,
    message,
    onAction: () => undoLastRentalAction(rental),
  });
}
