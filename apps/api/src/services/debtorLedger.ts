/**
 * Партия 23.10 (заказчик: «клиент отдал долг через карточку аренды, а в
 * должниках всё ещё висел»). Деньги дела — из ПЕРВОИСТОЧНИКА:
 *
 *  • долг за аренду — сама аренда: ручной долг + паркинг + неоплаченная
 *    аренда (+ просрочка, пока аренда идёт);
 *  • ущерб — акт и его платежи; выкуп — график сделки.
 *
 * А история платежей дела сверяется с реальными платежами (reconcile):
 * где бы ни приняли деньги — карточка аренды, «Принять платёж», паркинг,
 * карточка клиента, сделка выкупа, — в деле появляется строка; отменили
 * платёж — строка уходит. Платежи, принятые в самих «Должниках», уже
 * записаны строкой дела и не дублируются (пометка «Должник» в примечании).
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  buyoutPayments,
  debtEntries,
  debtorPayments,
  debtors,
  parkingSessions,
  payments,
  rentals,
  users,
} from "../db/schema.js";
import { overdueDailyRate } from "./overdueCharge.js";

const MSK = "Europe/Moscow";
const toMsk = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: MSK }));

/** Платежи аренды, которыми гасят долг за аренду. */
export const RENT_DEBT_PAY_TYPES = ["rent", "fine", "parking", "swap_fee", "equipment_fee"] as const;

/** Деньги, принятые в самих «Должниках», помечены так в примечании. */
const FROM_DEBTORS = /«Должник/;

/** Текущий долг по аренде (без ущерба) — для дел «долг за аренду». */
export async function rentOutstanding(rentalIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (rentalIds.length === 0) return out;
  const rows = await db
    .select({
      id: rentals.id,
      status: rentals.status,
      rate: rentals.rate,
      rateUnit: rentals.rateUnit,
      endPlannedAt: rentals.endPlannedAt,
      equipmentJson: rentals.equipmentJson,
    })
    .from(rentals)
    .where(inArray(rentals.id, rentalIds));
  const entries = await db.select().from(debtEntries).where(inArray(debtEntries.rentalId, rentalIds));
  const unpaid = await db
    .select({ rentalId: payments.rentalId, amount: payments.amount })
    .from(payments)
    .where(
      and(inArray(payments.rentalId, rentalIds), eq(payments.type, "rent"), eq(payments.paid, false)),
    );
  const parking = await db
    .select({
      rentalId: parkingSessions.rentalId,
      amount: parkingSessions.amount,
      paidAmount: parkingSessions.paidAmount,
    })
    .from(parkingSessions)
    .where(inArray(parkingSessions.rentalId, rentalIds));
  const nowMsk = toMsk(new Date());
  const today = new Date(nowMsk.getFullYear(), nowMsk.getMonth(), nowMsk.getDate());
  for (const r of rows) {
    const my = entries.filter((e) => e.rentalId === r.id);
    let overdue = 0;
    if (r.status === "active") {
      const endMsk = toMsk(r.endPlannedAt);
      const endDate = new Date(endMsk.getFullYear(), endMsk.getMonth(), endMsk.getDate());
      const days = Math.max(0, Math.floor((today.getTime() - endDate.getTime()) / 86_400_000));
      const daily = overdueDailyRate(r.rate, r.rateUnit, r.equipmentJson);
      const fine = Math.round(daily * 0.5) * days;
      let settled = 0;
      for (const e of my) {
        if (e.kind === "overdue_fine_forgive" && !e.appliedToEndPlanned) settled += e.amount;
        else if (e.kind === "overdue_fine_payment") settled += e.amount;
      }
      overdue = daily * days + Math.max(0, fine - settled);
    }
    const manual = Math.max(
      0,
      my.filter((e) => e.kind === "manual_charge").reduce((s, e) => s + e.amount, 0) -
        my.filter((e) => e.kind === "manual_forgive").reduce((s, e) => s + e.amount, 0),
    );
    const park = parking
      .filter((p) => p.rentalId === r.id)
      .reduce((s, p) => s + Math.max(0, p.amount - p.paidAmount), 0);
    const rent = unpaid.filter((p) => p.rentalId === r.id).reduce((s, p) => s + p.amount, 0);
    out.set(r.id, overdue + manual + park + rent);
  }
  return out;
}

/** Оплачено по аренде с момента заведения дела (любым путём). */
export async function rentPaidSince(
  cases: { id: number; relatedRentalId: number; createdAt: Date }[],
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (cases.length === 0) return out;
  const pays = await db
    .select({
      rentalId: payments.rentalId,
      amount: payments.amount,
      paidAt: payments.paidAt,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(
      and(
        inArray(payments.rentalId, cases.map((c) => c.relatedRentalId)),
        inArray(payments.type, [...RENT_DEBT_PAY_TYPES]),
        eq(payments.paid, true),
      ),
    );
  for (const c of cases) {
    const sum = pays
      .filter(
        (p) =>
          p.rentalId === c.relatedRentalId &&
          (p.paidAt ?? p.createdAt).getTime() >= c.createdAt.getTime(),
      )
      .reduce((s, p) => s + p.amount, 0);
    out.set(c.id, sum);
  }
  return out;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Сверка истории дела с реальными платежами. Идемпотентно.
 *  • платёж есть, строки нет → добавляем строку (кто принял и где);
 *  • строка ссылается на платёж, которого больше нет / снят «оплачен» →
 *    убираем строку (отменили — значит, денег нет).
 * Старые строки без ссылки (до 23.10) пробуем сопоставить по сумме и дню.
 */
export async function reconcileCaseHistory(caseIds?: number[]): Promise<number> {
  const all = await db.select().from(debtors);
  const cases = all.filter(
    (c) =>
      (!caseIds || caseIds.includes(c.id)) &&
      (c.damageReportId != null || c.buyoutDealId != null || c.relatedRentalId != null) &&
      (!String(c.stage).startsWith("closed_") ||
        (c.closedAt && Date.now() - c.closedAt.getTime() < 14 * 86_400_000)),
  );
  if (cases.length === 0) return 0;
  const rows = await db
    .select()
    .from(debtorPayments)
    .where(inArray(debtorPayments.debtorId, cases.map((c) => c.id)));
  const userNames = new Map(
    (await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]),
  );
  let changed = 0;

  // Все источники одним махом (а не запрос на каждое дело).
  const dealIds = cases.map((c) => c.buyoutDealId).filter((x): x is number => x != null);
  const reportIds = cases.map((c) => c.damageReportId).filter((x): x is number => x != null);
  const rentalIds = cases
    .filter((c) => c.damageReportId == null && c.buyoutDealId == null)
    .map((c) => c.relatedRentalId)
    .filter((x): x is number => x != null);
  const allBuyout = dealIds.length
    ? await db.select().from(buyoutPayments).where(inArray(buyoutPayments.dealId, dealIds))
    : [];
  const allDamage = reportIds.length
    ? await db
        .select()
        .from(payments)
        .where(and(inArray(payments.damageReportId, reportIds), eq(payments.type, "damage")))
    : [];
  const allRent = rentalIds.length
    ? await db
        .select()
        .from(payments)
        .where(
          and(inArray(payments.rentalId, rentalIds), inArray(payments.type, [...RENT_DEBT_PAY_TYPES])),
        )
    : [];

  for (const c of cases) {
    const mine = rows.filter((r) => r.debtorId === c.id);
    let maxN = mine.reduce((m, r) => Math.max(m, r.n), 0);
    type Src = { id: number; amount: number; at: Date; method: string; userId: number | null; what: string; note: string | null };
    let src: Src[] = [];
    let kind: "rent" | "buyout" = "rent";
    if (c.buyoutDealId != null) {
      kind = "buyout";
      const bp = allBuyout.filter(
        (p) => p.dealId === c.buyoutDealId && p.paidAt.getTime() >= c.createdAt.getTime(),
      );
      src = bp.map((p) => ({
        id: p.id,
        amount: p.amount,
        at: p.paidAt,
        method: p.method,
        userId: p.userId,
        what: "в сделке выкупа",
        note: p.note,
      }));
    } else {
      const ps =
        c.damageReportId != null
          ? allDamage.filter((p) => p.damageReportId === c.damageReportId)
          : allRent.filter((p) => p.rentalId === c.relatedRentalId);
      src = ps
        .filter((p) => p.paid)
        .filter(
          (p) =>
            // ущерб — все оплаты по акту; аренда — после заведения дела
            c.damageReportId != null ||
            (p.paidAt ?? p.createdAt).getTime() >= c.createdAt.getTime(),
        )
        .map((p) => ({
          id: p.id,
          amount: p.amount,
          at: p.paidAt ?? p.createdAt,
          method: p.method,
          userId: p.receivedByUserId,
          what:
            p.type === "parking"
              ? "паркинг, в карточке аренды"
              : p.type === "damage"
                ? "по акту, в карточке аренды"
                : "в карточке аренды",
          note: p.note,
        }));
    }
    const linkKey = kind === "buyout" ? "sourceBuyoutPaymentId" : "sourcePaymentId";
    const liveIds = new Set(src.map((s) => s.id));

    // Отменённые платежи — строки убираем.
    for (const r of mine) {
      const ref = r[linkKey as "sourcePaymentId"];
      if (ref != null && !liveIds.has(ref)) {
        await db.delete(debtorPayments).where(eq(debtorPayments.id, r.id));
        changed++;
      }
    }
    // Новые платежи — строки добавляем.
    const linked = new Set(mine.map((r) => r[linkKey as "sourcePaymentId"]).filter((x) => x != null));
    for (const s of src) {
      if (linked.has(s.id)) continue;
      if (s.note && FROM_DEBTORS.test(s.note)) continue; // принято в самих «Должниках»
      // Старые строки без ссылки (зеркало/дозапись до 23.10) — привязываем.
      const legacy = mine.find(
        (r) =>
          r[linkKey as "sourcePaymentId"] == null &&
          r.paidAt &&
          r.paidAmount === s.amount &&
          ymd(r.paidAt) === ymd(s.at),
      );
      if (legacy) {
        await db
          .update(debtorPayments)
          .set({ [linkKey]: s.id })
          .where(eq(debtorPayments.id, legacy.id));
        (legacy as Record<string, unknown>)[linkKey] = s.id;
        changed++;
        continue;
      }
      maxN += 1;
      const who = s.userId != null ? userNames.get(s.userId) : null;
      await db.insert(debtorPayments).values({
        debtorId: c.id,
        n: maxN,
        scheduledDate: ymd(s.at),
        scheduledAmount: s.amount,
        paidAt: s.at,
        paidAmount: s.amount,
        paidMethod: s.method === "cash" ? "cash" : "transfer",
        paidByUserId: s.userId,
        [linkKey]: s.id,
        note: `Принято ${s.what}${who ? ` · ${who}` : ""}`,
      });
      changed++;
    }
  }
  return changed;
}
