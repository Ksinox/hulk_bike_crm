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
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  debtors,
  debtorPayments,
  debtorStageEvents,
  users,
} from "../db/schema.js";
import { logActivity } from "./activityLog.js";
import { isClosed, type Stage } from "./debtorStages.js";
import { DAMAGE_PAID_REASON, loadCaseFinance } from "./debtorFinance.js";

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
  args: {
    rentalId: number;
    type: string;
    amount: number;
    method: string;
    damageReportId?: number | null;
  },
): Promise<void> {
  if (!MIRROR_TYPES.has(args.type)) return;
  if (!Number.isFinite(args.amount) || args.amount <= 0) return;

  // Партия 23.10: ущерб — в дело своего акта, аренда/просрочка — в дело
  // долга за аренду. Раньше всё падало в «одно дело на аренду».
  const candidates =
    args.type === "damage" && args.damageReportId != null
      ? await db
          .select()
          .from(debtors)
          .where(eq(debtors.damageReportId, args.damageReportId))
      : await db
          .select()
          .from(debtors)
          .where(
            and(
              eq(debtors.relatedRentalId, args.rentalId),
              isNull(debtors.damageReportId),
              ne(debtors.type, "damage"),
            ),
          );
  const d = candidates.find((c) => !isClosed(c.stage as Stage));
  if (!d) return; // дела нет (создастся синком) или уже закрыто

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

  // Авто-закрытие при полном погашении (у дела ущерба — по самому акту).
  const fin = (await loadCaseFinance([d])).get(d.id);
  if (fin && fin.remaining <= 0) {
    await db
      .update(debtors)
      .set({
        stage: "closed_paid",
        clientStatus: "closed",
        stageEnteredAt: now,
        closedAt: now,
        closedReason:
          d.damageReportId != null
            ? DAMAGE_PAID_REASON
            : "Долг погашен (через карточку аренды)",
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
