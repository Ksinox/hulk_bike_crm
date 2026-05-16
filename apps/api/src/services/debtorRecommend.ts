/**
 * v0.8 — Подсказки системы на карточке дела.
 *
 * Это «вторая пара глаз» — оператор увидел рекомендацию, оператор
 * решает. Никаких автоматических действий — только подсказка.
 * Используется в:
 *  - блоке «Рекомендация» в карточке дела
 *  - бейдже «к юристу» на «Утре»
 *  - dashboard widget «требуют действий»
 */

import { hasSystematicViolations, type PaymentForOverdue } from "./debtorOverdue.js";
import { isFullyPaid } from "./debtorSchedule.js";
import type { Stage } from "./debtorStages.js";

export type RecommendKind =
  | "transfer_lawyer"
  | "request_estimate"
  | "close_paid"
  | "call_overdue";

export type Recommendation = {
  kind: RecommendKind;
  /** Короткий повод (одна-две строки), для UI. */
  reason: string;
  /** В какой экран UI ведёт «согласиться»: либо роут, либо переход стадии. */
  cta?: {
    kind: "navigate" | "transition";
    /** Для navigate — URL-фрагмент относительно /debtors/:id. */
    target: string;
  };
};

type DebtorForRecommend = {
  stage: Stage;
  stageEnteredAt: Date | string;
  lastLawyerUpdateAt: Date | string | null;
  totalAmount: number;
  payments: PaymentForOverdue[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysSince(d: Date | string, today: Date): number {
  const t = typeof d === "string" ? new Date(d) : d;
  return Math.floor((today.getTime() - t.getTime()) / MS_PER_DAY);
}

/**
 * Главная функция. Возвращает рекомендацию (если есть) или null.
 * Приоритет правил — порядок их проверки. Первое сработавшее правило
 * возвращается.
 */
export function recommendNextAction(
  d: DebtorForRecommend,
  today: Date = new Date(),
): Recommendation | null {
  // Правило 1: график платежей + систематические нарушения → юрист
  if (
    d.stage === "payment_schedule" &&
    hasSystematicViolations(d.payments, today)
  ) {
    return {
      kind: "transfer_lawyer",
      reason: "3 просрочки подряд — пора передать юристу",
      cta: { kind: "navigate", target: "/transfer-lawyer" },
    };
  }

  // Правило 2: pretrial > 14 дней без подвижек → юрист
  if (
    d.stage === "pretrial" &&
    daysSince(d.stageEnteredAt, today) > 14
  ) {
    return {
      kind: "transfer_lawyer",
      reason: `${daysSince(d.stageEnteredAt, today)} дней в досудебке — нужно эскалировать`,
      cta: { kind: "navigate", target: "/transfer-lawyer" },
    };
  }

  // Правило 3: lawyer > 21 день без отчёта → запросить смету
  if (d.stage === "lawyer") {
    const lastUpdate = d.lastLawyerUpdateAt ?? d.stageEnteredAt;
    if (daysSince(lastUpdate, today) > 21) {
      return {
        kind: "request_estimate",
        reason: `${daysSince(lastUpdate, today)} дней без отчёта от юриста — запроси смету`,
        cta: { kind: "navigate", target: "/lawyer-update" },
      };
    }
  }

  // Правило 4: график платежей + всё оплачено → закрыть
  if (
    d.stage === "payment_schedule" &&
    isFullyPaid(d.totalAmount, d.payments)
  ) {
    return {
      kind: "close_paid",
      reason: "Все платежи закрыты — можно закрыть дело",
      cta: { kind: "transition", target: "closed_paid" },
    };
  }

  return null;
}
