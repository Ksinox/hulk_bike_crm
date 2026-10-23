import { payments } from "../db/schema.js";
import type { db } from "../db/index.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PaymentInsert = typeof payments.$inferInsert;

/**
 * 2.1: оплата «смешанно» — наличные и перевод отдельными проводками, чтобы
 * касса и фильтры выручки («только наличные / только безнал») считали каждую
 * свою часть. Снимок отката кладём на последнюю проводку вместе с id парной:
 * «Отменить» снимает обе разом.
 */
export async function insertSplitPayment(
  tx: Tx,
  base: Omit<PaymentInsert, "method" | "amount" | "rollbackSnapshot">,
  amount: number,
  method: "cash" | "transfer" | "mixed",
  cashAmount: number | undefined,
  snapshot?: object | null,
): Promise<void> {
  if (method !== "mixed") {
    await tx
      .insert(payments)
      .values({ ...base, amount, method, rollbackSnapshot: snapshot ?? null });
    return;
  }
  const cash = Math.max(0, Math.min(amount, cashAmount ?? 0));
  const transfer = amount - cash;
  if (cash === 0 || transfer === 0) {
    await tx.insert(payments).values({
      ...base,
      amount,
      method: cash > 0 ? "cash" : "transfer",
      rollbackSnapshot: snapshot ?? null,
    });
    return;
  }
  const [first] = await tx
    .insert(payments)
    .values({ ...base, amount: cash, method: "cash", rollbackSnapshot: null })
    .returning({ id: payments.id });
  await tx.insert(payments).values({
    ...base,
    amount: transfer,
    method: "transfer",
    rollbackSnapshot: snapshot
      ? ({ ...snapshot, pairedPaymentIds: [first!.id] } as object)
      : null,
  });
}

/** Подпись способа для журнала. */
export function splitMethodText(
  amount: number,
  method: "cash" | "transfer" | "mixed" | "card" | "deposit",
  cashAmount?: number,
): string {
  if (method === "cash") return "наличными";
  if (method === "transfer") return "переводом";
  if (method === "mixed") {
    const cash = Math.max(0, Math.min(amount, cashAmount ?? 0));
    return `смешанно: наличными ${cash.toLocaleString("ru-RU")} ₽ + переводом ${(amount - cash).toLocaleString("ru-RU")} ₽`;
  }
  if (method === "deposit") return "с депозита";
  return "картой";
}
