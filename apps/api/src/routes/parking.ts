import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  parkingSessions,
  payments,
  rentals,
  noteStickers,
  clients,
} from "../db/schema.js";
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

// Паркинг бывает двух видов:
//  • открытый (постоплата) — задаём только дату начала; растёт по дню, оплата
//    при снятии (v0.8.27 G4);
//  • предоплата (фикс. период) — задаём ещё и endDate (диапазон в календаре);
//    дни/конец закреплены, сумма известна сразу.
// freeFirstDay — тумблер «1-й день бесплатно» (по умолчанию ВКЛ).
const StartBody = z
  .object({
    startDate: z.string().regex(YMD),
    endDate: z.string().regex(YMD).optional(),
    freeFirstDay: z.boolean().optional().default(true),
  })
  .strict();

/** Кол-во календарных суток в периоде [start, end] включительно. */
function inclusiveDays(startYmd: string, endYmd: string): number {
  const s = Date.parse(`${startYmd}T00:00:00Z`);
  const e = Date.parse(`${endYmd}T00:00:00Z`);
  return Math.floor((e - s) / 86_400_000) + 1;
}

/** YYYY-MM-DD + n дней. */
function addDaysYmd(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Стоимость паркинга: при freeFirstDay 1-е сутки бесплатны, далее
 * RATE_PER_DAY/сут. Без freeFirstDay — считаем с первого дня.
 */
function parkingAmount(days: number, freeFirstDay = true): number {
  if (days <= 0) return 0;
  return freeFirstDay
    ? RATE_PER_DAY * Math.max(0, days - 1)
    : RATE_PER_DAY * days;
}

/**
 * Текущее состояние ОТКРЫТОЙ парковочной сессии на дату today:
 * сколько дней насчитано, текущий конец, достигнут ли максимум.
 */
function activeParkingState(startYmd: string, todayYmd: string) {
  const maxEndYmd = addDaysYmd(startYmd, MAX_DAYS - 1);
  const started = todayYmd >= startYmd;
  const capped = todayYmd > maxEndYmd; // прошло > MAX_DAYS суток
  const endYmd = !started ? startYmd : capped ? maxEndYmd : todayYmd;
  const days = !started ? 0 : inclusiveDays(startYmd, endYmd);
  return { endYmd, days, capped };
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
  // v0.8.27 (G4): «ленивое» продвижение открытых сессий — на каждый запрос
  // активный паркинг догоняется до сегодняшнего дня (растёт кол-во дней,
  // сдвигается возврат), а при достижении MAX_DAYS — авто-снятие.
  app.get("/parking", async () => {
    const live = await db
      .select({ id: rentals.id })
      .from(rentals)
      .where(isNull(rentals.archivedAt));
    const ids = live.map((r) => r.id);
    if (ids.length === 0) return { items: [] };
    let rows = await db
      .select()
      .from(parkingSessions)
      .where(inArray(parkingSessions.rentalId, ids))
      .orderBy(desc(parkingSessions.id));

    const today = todayMskYmd();
    let mutated = false;
    for (const s of rows) {
      if (s.status !== "active") continue;
      // Предоплата — фикс. период: не растим; авто-закрытие по окончании.
      if (s.prepaid) {
        if (today > s.endDate) {
          await db
            .update(parkingSessions)
            .set({ status: "ended", endedAt: new Date() })
            .where(eq(parkingSessions.id, s.id));
          mutated = true;
        }
        continue;
      }
      const { endYmd, days, capped } = activeParkingState(s.startDate, today);
      if (days === s.days && endYmd === s.endDate && !capped) continue;
      mutated = true;
      const amount = parkingAmount(days, s.freeFirstDay);
      await db.transaction(async (tx) => {
        await tx
          .update(parkingSessions)
          .set({
            endDate: endYmd,
            days,
            amount,
            status: capped ? "ended" : "active",
            endedAt: capped ? new Date() : null,
          })
          .where(eq(parkingSessions.id, s.id));
        await shiftEndPlanned(tx, s.rentalId, days - s.days);
      });
      if (capped) {
        await logActivity(null, {
          entity: "rental",
          entityId: s.rentalId,
          action: "parking_ended",
          summary: `Паркинг снят автоматически системой (достигнут максимум ${MAX_DAYS} дн): ${s.startDate}–${endYmd} · ${days} дн · ${amount} ₽`,
          meta: {
            parking: { startDate: s.startDate, endDate: endYmd, days, amount },
            autoEnded: true,
          },
        });
      }
    }
    if (mutated) {
      rows = await db
        .select()
        .from(parkingSessions)
        .where(inArray(parkingSessions.rentalId, ids))
        .orderBy(desc(parkingSessions.id));
    }
    return { items: rows };
  });

  // Поставить на паркинг.
  app.post<{ Params: { id: string } }>("/:id/parking", async (req, reply) => {
    if (!blockMechanic(req, reply)) return;
    const rentalId = Number(req.params.id);
    if (!Number.isFinite(rentalId))
      return reply.code(400).send({ error: "bad id" });
    const parsed = StartBody.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    const { startDate, endDate, freeFirstDay } = parsed.data;
    const isPrepaid = !!endDate;
    const [rental] = await db
      .select()
      .from(rentals)
      .where(eq(rentals.id, rentalId));
    if (!rental) return reply.code(404).send({ error: "rental not found" });

    // Предоплата: валидируем диапазон [startDate, endDate] и лимит дней.
    if (isPrepaid) {
      if (endDate! < startDate)
        return reply
          .code(400)
          .send({ error: "bad_range", message: "Конец периода раньше начала" });
      if (inclusiveDays(startDate, endDate!) > MAX_DAYS)
        return reply.code(400).send({
          error: "too_long",
          message: `Максимум ${MAX_DAYS} дней в одном периоде паркинга`,
        });
    }

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

    // F3 (v0.8.34): запрет пересечения периодов паркинга одной аренды.
    // Один день не может попасть в паркинг дважды. Новая (открытая) сессия
    // занимает интервал [startDate, startDate+MAX-1]; существующая —
    // [startDate, endDate]. Два включительных интервала пересекаются, если
    // a1 ≤ b2 && b1 ≤ a2. Сравнение строк YYYY-MM-DD лексикографически
    // эквивалентно сравнению дат.
    const newStart = startDate;
    // предоплата занимает ровно выбранный период; открытый — потенциальные MAX дней.
    const newMaxEnd = isPrepaid ? endDate! : addDaysYmd(startDate, MAX_DAYS - 1);
    const existing = await db
      .select({
        startDate: parkingSessions.startDate,
        endDate: parkingSessions.endDate,
      })
      .from(parkingSessions)
      .where(eq(parkingSessions.rentalId, rentalId));
    const overlaps = existing.some(
      (s) => newStart <= s.endDate && s.startDate <= newMaxEnd,
    );
    if (overlaps) {
      return reply.code(400).send({
        error: "parking_overlap",
        message: "Период паркинга пересекается с уже существующим",
      });
    }

    // Предоплата — фикс. период [startDate, endDate]; открытый — считаем дни на
    // сегодня (0 если старт в будущем) и далее растим лениво в GET /parking.
    const today = todayMskYmd();
    const openState = isPrepaid ? null : activeParkingState(startDate, today);
    const endYmd = isPrepaid ? endDate! : openState!.endYmd;
    const days = isPrepaid ? inclusiveDays(startDate, endDate!) : openState!.days;
    const amount = parkingAmount(days, freeFirstDay);
    const session = await db.transaction(async (tx) => {
      const [s] = await tx
        .insert(parkingSessions)
        .values({
          rentalId,
          startDate,
          endDate: endYmd,
          days,
          ratePerDay: RATE_PER_DAY,
          freeFirstDay,
          prepaid: isPrepaid,
          amount,
          paidAmount: 0,
          status: "active",
          createdByUserId: req.user?.userId ?? null,
          createdByName: req.user?.login ?? null,
        })
        .returning();
      await shiftEndPlanned(tx, rentalId, days);
      return s;
    });

    const dm = (ymd: string) => {
      const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return m ? `${m[3]}.${m[2]}` : ymd;
    };
    await logActivity(req, {
      entity: "rental",
      entityId: rentalId,
      action: "parking_set",
      summary: isPrepaid
        ? `Поставлен на паркинг (предоплата) ${startDate}–${endYmd} · ${days} дн · ${amount} ₽ (1-й день ${freeFirstDay ? "бесплатно" : "платно"})`
        : `Поставлен на паркинг с ${startDate} (открытый, макс ${MAX_DAYS} дн; 1-й день ${freeFirstDay ? "бесплатно" : "платно"})`,
      // sessionId — для отката постановки «в день совершения» (rollback-action
      // удаляет сессию и возвращает сдвиг возврата).
      meta: {
        sessionId: session?.id ?? null,
        parking: {
          startDate,
          endDate: endYmd,
          days,
          amount,
          freeFirstDay,
          prepaid: isPrepaid,
          open: !isPrepaid,
        },
      },
    });

    // v0.8.18/0.8.27: стикер-заметка с водяным знаком «P» (синий).
    await db.insert(noteStickers).values({
      entity: "rental",
      entityId: rentalId,
      kind: "parking",
      text: isPrepaid
        ? `Паркинг ${dm(startDate)}–${dm(endYmd)} · ${days} дн (предоплата)`
        : `Паркинг с ${dm(startDate)} · идёт${days > 0 ? ` · ${days} дн` : ""}`,
      color: "blue",
      createdByUserId: req.user?.userId ?? null,
      createdByName: req.user?.login ?? null,
    });

    return { session };
  });

  // v0.8.27: PATCH-редактирование периода удалено — паркинг теперь открытый
  // (дата начала + ручное/авто снятие), фиксированный период не задаётся.

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

      // Предоплата: период закреплён — ручное снятие просто закрывает сессию,
      // дни/сумму/сдвиг не трогаем (ранний возврат с пересчётом-на-депозит —
      // отдельный флоу). Откат по sessionId/before.
      if (existing.prepaid) {
        const [s] = await db
          .update(parkingSessions)
          .set({ status: "ended", endedAt: new Date() })
          .where(eq(parkingSessions.id, sid))
          .returning();
        await logActivity(req, {
          entity: "rental",
          entityId: rentalId,
          action: "parking_ended",
          summary: `Паркинг (предоплата) снят: ${existing.startDate}–${existing.endDate} · ${existing.days} дн · ${existing.amount} ₽`,
          meta: {
            sessionId: sid,
            prepaid: true,
            before: {
              endDate: existing.endDate,
              days: existing.days,
              amount: existing.amount,
            },
            delta: 0,
            parking: {
              startDate: existing.startDate,
              endDate: existing.endDate,
              days: existing.days,
              amount: existing.amount,
            },
          },
        });
        return { session: s };
      }

      const today = todayMskYmd();
      // v0.8.27: ручное снятие — сегодня ещё считается паркингом; ограничиваем
      // диапазоном [старт, старт+MAX-1].
      const maxEnd = addDaysYmd(existing.startDate, MAX_DAYS - 1);
      const newEnd =
        today < existing.startDate
          ? existing.startDate
          : today > maxEnd
            ? maxEnd
            : today;
      const newDays = inclusiveDays(existing.startDate, newEnd);
      const newAmount = parkingAmount(newDays, existing.freeFirstDay);
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
        summary: `Паркинг снят вручную: ${existing.startDate}–${newEnd} · ${newDays} дн · ${newAmount} ₽`,
        // before/delta — для отката снятия «в день совершения» (rollback-action
        // возвращает сессию в active с прежними датами и откатывает сдвиг).
        meta: {
          sessionId: sid,
          before: {
            endDate: existing.endDate,
            days: existing.days,
            amount: existing.amount,
          },
          delta,
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

      // Для оплаты С ДЕПОЗИТА нужен клиент — списываем его кошелёк.
      const [rentalRow] = await db
        .select({ clientId: rentals.clientId })
        .from(rentals)
        .where(eq(rentals.id, rentalId));
      const clientId = rentalRow?.clientId ?? null;

      const sessions = await db
        .select()
        .from(parkingSessions)
        .where(eq(parkingSessions.rentalId, rentalId))
        .orderBy(parkingSessions.startDate);

      let applied = 0;
      try {
        applied = await db.transaction(async (tx) => {
          let used = 0;
          // Раскладка оплаты по сессиям — кладём в снимок отката, чтобы un-pay
          // вернул paidAmount каждой сессии ровно на принятое.
          const allocations: Array<{ sessionId: number; amount: number }> = [];
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
            allocations.push({ sessionId: s.id, amount: take });
          }
          // Оплата с депозита клиента: списываем кошелёк (revenue исключает
          // method='deposit'). Не хватает баланса → откатываем транзакцию.
          let depositSpent = 0;
          if (method === "deposit" && used > 0) {
            if (!clientId) throw new Error("no_client");
            const [c] = await tx
              .select({ balance: clients.depositBalance })
              .from(clients)
              .where(eq(clients.id, clientId));
            if (!c || c.balance < used) throw new Error("insufficient_deposit");
            await tx
              .update(clients)
              .set({
                depositBalance: sql`${clients.depositBalance} - ${used}`,
              })
              .where(eq(clients.id, clientId));
            depositSpent = used;
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
              rollbackSnapshot: {
                kind: "parking",
                allocations,
                // Для отката оплаты с депозита — вернуть кошелёк клиента.
                depositSpent,
                clientId,
              } as unknown as object,
            });
          }
          return used;
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "insufficient_deposit")
          return reply.code(400).send({
            error: "insufficient_deposit",
            message: "Недостаточно средств на депозите клиента",
          });
        if (msg === "no_client")
          return reply
            .code(400)
            .send({ error: "no_client", message: "У аренды нет клиента" });
        throw e;
      }

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
