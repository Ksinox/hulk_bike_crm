import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { parkingSessions, payments, rentals, noteStickers } from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";

/* ============================================================
 * Паркинг (пауза аренды).
 *
 * Маршруты под префиксом /api/rentals:
 *   GET    /parking                 — все сессии по живым арендам
 *   POST   /:id/parking             — поставить на паркинг (start..end)
 *   PATCH  /:id/parking/:sid        — изменить период
 *   POST   /:id/parking/:sid/end    — снять с паркинга (закрыть сегодня)
 *   DELETE /:id/parking/:sid        — удалить сессию
 *
 * Модель: rentals.end_planned_at = базовый возврат + Σ days всех сессий.
 * Каждая мутация применяет ТОЛЬКО дельту дней к end_planned_at — это
 * композируется с другими сдвигами (продления, оплата просрочки) и
 * автоматически пересчитывает просрочку (она считается от end_planned_at).
 * ============================================================ */

const RATE_PER_DAY = 250;
const MAX_DAYS = 7;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const PeriodBody = z
  .object({
    startDate: z.string().regex(YMD),
    endDate: z.string().regex(YMD),
  })
  .strict();

/** Кол-во календарных суток в периоде [start, end] включительно. */
function inclusiveDays(startYmd: string, endYmd: string): number {
  const s = Date.parse(`${startYmd}T00:00:00Z`);
  const e = Date.parse(`${endYmd}T00:00:00Z`);
  return Math.floor((e - s) / 86_400_000) + 1;
}

/** Стоимость паркинга: 1-е сутки бесплатно, далее RATE_PER_DAY/сут. */
function parkingAmount(days: number): number {
  return days > 1 ? RATE_PER_DAY * (days - 1) : 0;
}

/** Сегодня по Москве в формате YYYY-MM-DD. */
function todayMskYmd(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // en-CA даёт YYYY-MM-DD
}

/** Тип транзакционного объекта drizzle. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Сдвинуть end_planned_at аренды на deltaDays (может быть отрицательным). */
async function shiftEndPlanned(
  tx: Tx,
  rentalId: number,
  deltaDays: number,
): Promise<void> {
  if (deltaDays === 0) return;
  const [r] = await tx
    .select({ end: rentals.endPlannedAt })
    .from(rentals)
    .where(eq(rentals.id, rentalId));
  if (!r) return;
  const next = new Date(r.end.getTime() + deltaDays * 86_400_000);
  await tx
    .update(rentals)
    .set({ endPlannedAt: next, updatedAt: new Date() })
    .where(eq(rentals.id, rentalId));
}

function blockMechanic(
  req: { user?: { role?: string } },
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
): boolean {
  if (req.user?.role === "mechanic") {
    reply.code(403).send({
      error: "forbidden",
      message: "Паркинг недоступен механику.",
    });
    return false;
  }
  return true;
}

export async function parkingRoutes(app: FastifyInstance) {
  // Все сессии паркинга по неархивным арендам.
  app.get("/parking", async () => {
    const live = await db
      .select({ id: rentals.id })
      .from(rentals)
      .where(isNull(rentals.archivedAt));
    const ids = live.map((r) => r.id);
    if (ids.length === 0) return { items: [] };
    const rows = await db
      .select()
      .from(parkingSessions)
      .where(inArray(parkingSessions.rentalId, ids))
      .orderBy(desc(parkingSessions.id));
    return { items: rows };
  });

  // Поставить на паркинг.
  app.post<{ Params: { id: string } }>("/:id/parking", async (req, reply) => {
    if (!blockMechanic(req, reply)) return;
    const rentalId = Number(req.params.id);
    if (!Number.isFinite(rentalId))
      return reply.code(400).send({ error: "bad id" });
    const parsed = PeriodBody.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    const { startDate, endDate } = parsed.data;
    const days = inclusiveDays(startDate, endDate);
    if (days < 1 || days > MAX_DAYS) {
      return reply.code(400).send({
        error: "bad_period",
        message: `Период паркинга — от 1 до ${MAX_DAYS} суток.`,
      });
    }
    const [rental] = await db
      .select()
      .from(rentals)
      .where(eq(rentals.id, rentalId));
    if (!rental) return reply.code(404).send({ error: "rental not found" });

    // Паркинг не может начинаться раньше выдачи скутера.
    const rentalStartYmd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(rental.startAt);
    if (startDate < rentalStartYmd) {
      return reply.code(400).send({
        error: "before_issue",
        message: "Паркинг не может начинаться раньше выдачи скутера.",
      });
    }

    const amount = parkingAmount(days);
    const session = await db.transaction(async (tx) => {
      const [s] = await tx
        .insert(parkingSessions)
        .values({
          rentalId,
          startDate,
          endDate,
          days,
          ratePerDay: RATE_PER_DAY,
          freeFirstDay: true,
          amount,
          paidAmount: 0,
          status: "active",
          createdByUserId: req.user?.userId ?? null,
          createdByName: req.user?.login ?? null,
        })
        .returning();
      // Дни паркинга сдвигают плановый возврат вперёд.
      await shiftEndPlanned(tx, rentalId, days);
      return s;
    });

    await logActivity(req, {
      entity: "rental",
      entityId: rentalId,
      action: "parking_set",
      summary: `Паркинг ${startDate}–${endDate} · ${days} дн · ${amount} ₽`,
      meta: { parking: { startDate, endDate, days, amount } },
    });

    // v0.8.18 (E2): инфо о паркинге уходит ещё и в стикер-заметку с водяным
    // знаком «P» (kind=parking) — чтобы было видно на карточке.
    const dm = (ymd: string) => {
      const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return m ? `${m[3]}.${m[2]}` : ymd;
    };
    await db.insert(noteStickers).values({
      entity: "rental",
      entityId: rentalId,
      kind: "parking",
      text: `Паркинг ${dm(startDate)}–${dm(endDate)} · ${days} дн${amount > 0 ? ` · ${amount} ₽` : ""}`,
      color: "yellow",
      createdByUserId: req.user?.userId ?? null,
      createdByName: req.user?.login ?? null,
    });

    return { session };
  });

  // Изменить период паркинга.
  app.patch<{ Params: { id: string; sid: string } }>(
    "/:id/parking/:sid",
    async (req, reply) => {
      if (!blockMechanic(req, reply)) return;
      const rentalId = Number(req.params.id);
      const sid = Number(req.params.sid);
      if (!Number.isFinite(rentalId) || !Number.isFinite(sid))
        return reply.code(400).send({ error: "bad id" });
      const parsed = PeriodBody.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      const { startDate, endDate } = parsed.data;
      const days = inclusiveDays(startDate, endDate);
      if (days < 1 || days > MAX_DAYS)
        return reply.code(400).send({
          error: "bad_period",
          message: `Период паркинга — от 1 до ${MAX_DAYS} суток.`,
        });
      const [existing] = await db
        .select()
        .from(parkingSessions)
        .where(
          and(
            eq(parkingSessions.id, sid),
            eq(parkingSessions.rentalId, rentalId),
          ),
        );
      if (!existing) return reply.code(404).send({ error: "not found" });

      const amount = parkingAmount(days);
      const delta = days - existing.days;
      const updated = await db.transaction(async (tx) => {
        const [s] = await tx
          .update(parkingSessions)
          .set({ startDate, endDate, days, amount })
          .where(eq(parkingSessions.id, sid))
          .returning();
        await shiftEndPlanned(tx, rentalId, delta);
        return s;
      });

      await logActivity(req, {
        entity: "rental",
        entityId: rentalId,
        action: "parking_edited",
        summary: `Паркинг изменён: ${startDate}–${endDate} · ${days} дн · ${amount} ₽`,
        meta: { parking: { startDate, endDate, days, amount } },
      });

      return { session: updated };
    },
  );

  // Снять с паркинга (закрыть сегодня).
  app.post<{ Params: { id: string; sid: string } }>(
    "/:id/parking/:sid/end",
    async (req, reply) => {
      if (!blockMechanic(req, reply)) return;
      const rentalId = Number(req.params.id);
      const sid = Number(req.params.sid);
      if (!Number.isFinite(rentalId) || !Number.isFinite(sid))
        return reply.code(400).send({ error: "bad id" });
      const [existing] = await db
        .select()
        .from(parkingSessions)
        .where(
          and(
            eq(parkingSessions.id, sid),
            eq(parkingSessions.rentalId, rentalId),
          ),
        );
      if (!existing) return reply.code(404).send({ error: "not found" });

      const today = todayMskYmd();
      // Новый конец — сегодня, но не раньше начала и не позже текущего конца.
      let newEnd = today;
      if (today < existing.startDate) newEnd = existing.startDate;
      if (today > existing.endDate) newEnd = existing.endDate;
      const newDays = inclusiveDays(existing.startDate, newEnd);
      const newAmount = parkingAmount(newDays);
      const delta = newDays - existing.days;

      const updated = await db.transaction(async (tx) => {
        const [s] = await tx
          .update(parkingSessions)
          .set({
            endDate: newEnd,
            days: newDays,
            amount: newAmount,
            status: "ended",
            endedAt: new Date(),
          })
          .where(eq(parkingSessions.id, sid))
          .returning();
        await shiftEndPlanned(tx, rentalId, delta);
        return s;
      });

      await logActivity(req, {
        entity: "rental",
        entityId: rentalId,
        action: "parking_ended",
        summary: `Паркинг снят: ${existing.startDate}–${newEnd} · ${newDays} дн · ${newAmount} ₽`,
        meta: {
          parking: {
            startDate: existing.startDate,
            endDate: newEnd,
            days: newDays,
            amount: newAmount,
          },
        },
      });

      return { session: updated };
    },
  );

  // Удалить сессию паркинга.
  app.delete<{ Params: { id: string; sid: string } }>(
    "/:id/parking/:sid",
    async (req, reply) => {
      if (!blockMechanic(req, reply)) return;
      const rentalId = Number(req.params.id);
      const sid = Number(req.params.sid);
      if (!Number.isFinite(rentalId) || !Number.isFinite(sid))
        return reply.code(400).send({ error: "bad id" });
      const [existing] = await db
        .select()
        .from(parkingSessions)
        .where(
          and(
            eq(parkingSessions.id, sid),
            eq(parkingSessions.rentalId, rentalId),
          ),
        );
      if (!existing) return reply.code(404).send({ error: "not found" });

      await db.transaction(async (tx) => {
        await tx.delete(parkingSessions).where(eq(parkingSessions.id, sid));
        // Удаление сессии убирает её сдвиг возврата назад.
        await shiftEndPlanned(tx, rentalId, -existing.days);
      });

      await logActivity(req, {
        entity: "rental",
        entityId: rentalId,
        action: "parking_deleted",
        summary: `Паркинг удалён: ${existing.startDate}–${existing.endDate} · ${existing.days} дн`,
        meta: {
          parking: {
            startDate: existing.startDate,
            endDate: existing.endDate,
            days: existing.days,
            amount: existing.amount,
          },
        },
      });

      return { ok: true };
    },
  );

  // Принять оплату паркинга. amount распределяется FIFO по сессиям с
  // непогашенным остатком (paid_amount растёт), создаётся payment-строка
  // type='parking' (попадает в выручку и в «За всё время» клиента).
  app.post<{ Params: { id: string } }>(
    "/:id/parking/pay",
    async (req, reply) => {
      if (!blockMechanic(req, reply)) return;
      const rentalId = Number(req.params.id);
      if (!Number.isFinite(rentalId))
        return reply.code(400).send({ error: "bad id" });
      const Body = z
        .object({
          amount: z.number().int().positive(),
          method: z.enum(["cash", "card", "transfer", "deposit"]).optional(),
        })
        .strict();
      const parsed = Body.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      let remaining = parsed.data.amount;
      const method = parsed.data.method ?? "cash";

      const sessions = await db
        .select()
        .from(parkingSessions)
        .where(eq(parkingSessions.rentalId, rentalId))
        .orderBy(parkingSessions.startDate);

      const applied = await db.transaction(async (tx) => {
        let used = 0;
        for (const s of sessions) {
          if (remaining <= 0) break;
          const due = Math.max(0, s.amount - s.paidAmount);
          if (due <= 0) continue;
          const take = Math.min(due, remaining);
          await tx
            .update(parkingSessions)
            .set({ paidAmount: s.paidAmount + take })
            .where(eq(parkingSessions.id, s.id));
          remaining -= take;
          used += take;
        }
        if (used > 0) {
          await tx.insert(payments).values({
            rentalId,
            type: "parking",
            amount: used,
            method,
            paid: true,
            paidAt: new Date(),
            receivedByUserId: req.user?.userId ?? null,
            note: "Оплата паркинга",
          });
        }
        return used;
      });

      if (applied > 0) {
        await logActivity(req, {
          entity: "rental",
          entityId: rentalId,
          action: "parking_paid",
          summary: `Оплата паркинга: ${applied.toLocaleString("ru-RU")} ₽`,
          meta: { parking: { amount: applied } },
        });
      }

      return { applied };
    },
  );
}
