/**
 * v0.8 — Финансовый прогноз для dtp_victim (ДТП-потерпевший).
 *
 * Бизнес-смысл: страховая выплачивает по своей оценке, мы ремонтируем
 * скутер на свою себестоимость (обычно ниже оценки). Разница — наша
 * прибыль с этого кейса.
 *
 *   profit = payout − repairCost
 *
 * Если что-то из (estimate, payout, repairCost) ещё не заполнено —
 * возвращаем то что известно с null для прибыли.
 */

import type { DebtType } from "./debtorStages.js";

export type InsuranceInputs = {
  type: DebtType;
  insuranceEstimate?: number | null;
  insurancePayout?: number | null;
  repairCost?: number | null;
};

export type InsuranceForecast = {
  estimate: number | null;
  payout: number | null;
  repairCost: number | null;
  /** payout − repairCost. null если хотя бы одно не заполнено. */
  profit: number | null;
  /** «Ожидаем» (только оценка есть) vs «факт» (выплата получена). */
  stage: "before_estimate" | "estimated" | "paid_out" | "complete";
};

export function calculateInsuranceForecast(
  d: InsuranceInputs,
): InsuranceForecast | null {
  // Только для dtp_victim
  if (d.type !== "dtp_victim") return null;

  const estimate = d.insuranceEstimate ?? null;
  const payout = d.insurancePayout ?? null;
  const repairCost = d.repairCost ?? null;

  let stage: InsuranceForecast["stage"] = "before_estimate";
  if (estimate != null && payout == null) stage = "estimated";
  else if (payout != null && repairCost == null) stage = "paid_out";
  else if (payout != null && repairCost != null) stage = "complete";

  const profit = payout != null && repairCost != null ? payout - repairCost : null;

  return { estimate, payout, repairCost, profit, stage };
}

/**
 * Прогноз прибыли ДО получения выплаты — берём оценку как proxy.
 * Используется на UI для отображения «ожидаемая прибыль ~X ₽»
 * пока ждём страховую.
 */
export function expectedProfit(d: InsuranceInputs): number | null {
  if (d.type !== "dtp_victim") return null;
  if (d.repairCost == null) return null;
  // Если есть фактическая выплата — её и используем
  if (d.insurancePayout != null) return d.insurancePayout - d.repairCost;
  // Иначе — оценка
  if (d.insuranceEstimate != null) return d.insuranceEstimate - d.repairCost;
  return null;
}
