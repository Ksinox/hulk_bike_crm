/**
 * v0.6 — зеркалирование платежей по аренде в дело-должник.
 *
 * Сценарий владельца: клиент должен и сам приезжает к АДМИНИСТРАТОРУ, тот
 * принимает оплату через карточку аренды (погашение аренды/просрочки/ущерба).
 * Директор работает с должниками в отдельном модуле — и должен видеть, что
 * деньги уже приняты «на месте»: кем и по какому долгу.
 *
 * Поэтому при оплате долга по аренде (rent/fine/damage) — если у аренды есть
 * открытое дело-должник — добавляем в дело запись о платеже с пометкой
 * «Принято через карточку аренды (тип) · {пользователь}». Дело становится
 * «ведётся в модуле» и авто-закрывается при полном погашении.
 */
import type { FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  debtors,
  debtorPayments,
  debtorStageEvents,
  users,
} from "../db/schema.js";
import { logActivity } from "./activityLog.js";
import { isClosed, type Stage } from "./debtorStages.js";

/** Типы платежей по аренде, которые гасят «долг» (а не залог/возврат). */
const MIRROR_TYPES = new Set(["rent", "fine", "damage"]);

const TYPE_LABEL: Record<string, string> = {
  rent: "аренда",
  fine: "просрочка",
  damage: "ущерб",
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function mirrorRentalPaymentToDebtor(
  req: FastifyRequest,
  args: { rentalId: number; type: string; amount: number; method: string },
): Promise<void> {
  if (!MIRROR_TYPES.has(args.type)) return;
  if (!Number.isFinite(args.amount) || args.amount <= 0) return;

  const [d] = await db
    .select()
    .from(debtors)
    .where(eq(debtors.relatedRentalId, args.rentalId));
  if (!d) return; // дело ещё не заведено (создастся синком позже) — пропускаем
  if (isClosed(d.stage as Stage)) return;

  // Имя пользователя, принявшего платёж (для пометки «кто принял»).
  let userName = "администратор";
  const userId = req.user?.userId ?? null;
  if (userId != null) {
    const [u] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId));
    userName = u?.name ?? req.user?.login ?? "администратор";
  }

  const paidMethod: "cash" | "transfer" =
    args.method === "cash" ? "cash" : "transfer";
  const now = new Date();
  const label = TYPE_LABEL[args.type] ?? args.type;

  const existing = await db
    .select()
    .from(debtorPayments)
    .where(eq(debtorPayments.debtorId, d.id));
  const maxN = existing.reduce((m, p) => Math.max(m, p.n), 0);

  await db.insert(debtorPayments).values({
    debtorId: d.id,
    n: maxN + 1,
    scheduledDate: ymd(now),
    scheduledAmount: args.amount,
    paidAt: now,
    paidAmount: args.amount,
    paidMethod,
    paidByUserId: userId,
    note: `Принято через карточку аренды (${label}) · ${userName}`,
  });

  await logActivity(req, {
    entity: "debtor",
    entityId: d.id,
    action: "payment_received",
    summary: `${d.caseNumber}: платёж ${args.amount.toLocaleString("ru-RU")} ₽ через карточку аренды (${label}) · ${userName}`,
  });

  // Авто-закрытие при полном погашении.
  const all = await db
    .select()
    .from(debtorPayments)
    .where(eq(debtorPayments.debtorId, d.id));
  const paid = all
    .filter((p) => p.paidAt)
    .reduce((s, p) => s + (p.paidAmount ?? 0), 0);
  if (paid >= d.totalAmount) {
    await db
      .update(debtors)
      .set({
        stage: "closed_paid",
        clientStatus: "closed",
        stageEnteredAt: now,
        closedAt: now,
        closedReason: "Долг погашен (через карточку аренды)",
        updatedAt: now,
      })
      .where(eq(debtors.id, d.id));
    await db.insert(debtorStageEvents).values({
      debtorId: d.id,
      fromStage: d.stage as Stage,
      toStage: "closed_paid",
      reason: "авто: долг погашен через карточку аренды",
      userId,
    });
    await logActivity(req, {
      entity: "debtor",
      entityId: d.id,
      action: "closed",
      summary: `${d.caseNumber}: закрыто — долг погашен через карточку аренды`,
    });
  }
}
