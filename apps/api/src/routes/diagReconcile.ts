import type { FastifyInstance } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { clients, payments, rentals } from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";

/**
 * Ревизор рассинхрона «sum vs rent-платежи».
 *
 * Защитный диагностико-восстановительный модуль — только creator/director.
 *
 * ── Инвариант ──
 * Для НЕ-архивной аренды (archivedAt IS NULL):
 *   Σ(payments where type='rent' AND paid=true).amount === rentals.sum
 *
 * Когда инвариант держится — «За всё время» клиента
 * (web useClientStats.totalPaid = Σ оплаченных rent-платежей,
 *  БЕЗ депозита/возврата) и выручка на дашборде корректны.
 *
 * ── Откуда берётся рассинхрон ──
 * Старая логика правки аренды («Изменить аренду») и одиночная синхронизация
 * платежа иногда оставляли «фантомный» rent-платёж (например продление,
 * период которого откатили, а денег не собрали). Пример: аренда #134 —
 * sum=3000, но два оплаченных rent-платежа по 3000 (=6000); второй надо
 * срезать до 0 (продление-фантом) → итог снова 3000.
 *
 * GET  /api/_diag/payment-reconcile        — DRY-RUN, только чтение, аудит-лист.
 * POST /api/_diag/payment-reconcile/apply  — точечный фикс ПЕРЕ-записанной аренды
 *                                            (paidRent > sum), в транзакции,
 *                                            только type='rent', залог не трогаем.
 */

/** Только creator/director. Зеркалит гейт из rentals.ts (DELETE /:id). */
function isCreatorOrDirector(role: string): boolean {
  return role === "creator" || role === "director";
}

/**
 * Признак «продление»: текст rent-платежа вида «продление на N дн …».
 * Совпадает с note, который пишет extend-inplace в rentals.ts
 * («продление на ${extraDays} дн (оплачено)» и т.п.).
 */
const EXTEND_NOTE_RE = /продлени[ея]\s+на\s+\d+\s*дн/i;

type RentPaymentRow = {
  id: number;
  amount: number;
  paid: boolean;
  note: string | null;
};

/** Тип tx-объекта внутри db.transaction (как в parking.ts). */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Собирает все rent-платежи (любой paid) одной аренды, упорядоченные по id.
 * paidRent считаем здесь же как Σ amount по paid=true.
 */
async function loadRentPayments(
  exec: Tx,
  rentalId: number,
): Promise<{ rows: RentPaymentRow[]; paidRent: number }> {
  const rows = await exec
    .select({
      id: payments.id,
      amount: payments.amount,
      paid: payments.paid,
      note: payments.note,
    })
    .from(payments)
    .where(and(eq(payments.rentalId, rentalId), eq(payments.type, "rent")))
    .orderBy(payments.id);
  const paidRent = rows.reduce(
    (s, p) => s + (p.paid ? (p.amount ?? 0) : 0),
    0,
  );
  return { rows, paidRent };
}

const ApplyBody = z
  .object({
    rentalId: z.number().int().positive(),
    action: z.enum(["trim_latest", "delete_payment"]),
    paymentId: z.number().int().positive().optional(),
  })
  .strict();

/**
 * Результат транзакции apply: либо HTTP-ошибка (валидация/недо-запись),
 * либо успех с before/after. Дискриминированный union — чтобы наружу
 * вернуть нужный код/тело и не потерять типизацию.
 */
type ApplyResult =
  | { kind: "error"; code: number; body: Record<string, unknown> }
  | {
      kind: "ok";
      before: { paidRent: number; rentalSum: number };
      after: { paidRent: number; rentalSum: number };
      capped: boolean;
    };

export async function diagReconcileRoutes(app: FastifyInstance) {
  /**
   * GET /api/_diag/payment-reconcile — DRY-RUN, read-only.
   *
   * Для каждой НЕ-архивной аренды сравнивает paidRent (Σ оплаченных
   * rent-платежей) с rentals.sum. Возвращает список расхождений,
   * отсортированный по |diff| убыв. Ничего не пишет в БД.
   */
  app.get("/payment-reconcile", async (req, reply) => {
    if (!isCreatorOrDirector(req.user.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    // Все не-архивные аренды + имя клиента (для аудит-листа).
    const rentalRows = await db
      .select({
        rentalId: rentals.id,
        rentalSum: rentals.sum,
        clientName: clients.name,
      })
      .from(rentals)
      .leftJoin(clients, eq(rentals.clientId, clients.id))
      .where(isNull(rentals.archivedAt))
      .orderBy(rentals.id);

    // Все rent-платежи разом, группируем в памяти — без N+1 запросов.
    const rentRows = await db
      .select({
        id: payments.id,
        rentalId: payments.rentalId,
        amount: payments.amount,
        paid: payments.paid,
        note: payments.note,
      })
      .from(payments)
      .where(eq(payments.type, "rent"))
      .orderBy(payments.id);

    const byRental = new Map<number, RentPaymentRow[]>();
    for (const p of rentRows) {
      const list = byRental.get(p.rentalId) ?? [];
      list.push({ id: p.id, amount: p.amount, paid: p.paid, note: p.note });
      byRental.set(p.rentalId, list);
    }

    const mismatches: Array<{
      rentalId: number;
      clientName: string | null;
      rentalSum: number;
      paidRent: number;
      diff: number;
      rentPaymentCount: number;
      extended: boolean;
      rentPayments: RentPaymentRow[];
    }> = [];

    for (const r of rentalRows) {
      const list = byRental.get(r.rentalId) ?? [];
      const paidRent = list.reduce(
        (s, p) => s + (p.paid ? (p.amount ?? 0) : 0),
        0,
      );
      const diff = paidRent - r.rentalSum;
      if (diff === 0) continue;
      mismatches.push({
        rentalId: r.rentalId,
        clientName: r.clientName,
        rentalSum: r.rentalSum,
        paidRent,
        diff,
        rentPaymentCount: list.length,
        extended: list.some(
          (p) => p.note != null && EXTEND_NOTE_RE.test(p.note),
        ),
        rentPayments: list,
      });
    }

    mismatches.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    return { total: rentalRows.length, mismatches };
  });

  /**
   * POST /api/_diag/payment-reconcile/apply — точечный фикс.
   *
   * Тело: { rentalId, action: 'trim_latest' | 'delete_payment', paymentId? }
   *
   *  • trim_latest    — для ПЕРЕ-записанной аренды (paidRent > sum) уменьшает
   *                     ПОСЛЕДНИЙ (max id) rent-платёж так, чтобы
   *                     Σ(rent-платежей)=sum. Если ушло бы в минус — режет до 0
   *                     и сообщает (capped).
   *  • delete_payment — жёстко удаляет указанный rent-платёж (явный фантом).
   *                     Проверяем, что он принадлежит аренде и type='rent'.
   *
   * Защита: только creator/director, всё в db.transaction, трогаем ТОЛЬКО
   * type='rent' (залог/депозит/возврат не касаемся). НЕДО-записанные аренды
   * (paidRent < sum — это долг/недосбор) НЕ чиним автоматически — ошибка
   * «under-recorded, ручная проверка».
   */
  app.post("/payment-reconcile/apply", async (req, reply) => {
    if (!isCreatorOrDirector(req.user.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const parsed = ApplyBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const { rentalId, action, paymentId } = parsed.data;
    if (action === "delete_payment" && !paymentId) {
      return reply.code(400).send({
        error: "validation",
        message: "delete_payment requires paymentId",
      });
    }

    try {
      const result = await db.transaction(
        async (tx): Promise<ApplyResult> => {
          // Берём аренду (точечно по id).
          const [rental] = await tx
            .select({ id: rentals.id, sum: rentals.sum })
            .from(rentals)
            .where(eq(rentals.id, rentalId));
          if (!rental) {
            return {
              kind: "error",
              code: 404,
              body: { error: "rental_not_found" },
            };
          }

          const before = await loadRentPayments(tx, rentalId);
          const rentalSum = rental.sum;

          // НЕДО-записанные не чиним — это другой случай (реальный долг).
          if (before.paidRent < rentalSum) {
            return {
              kind: "error",
              code: 409,
              body: {
                error: "under_recorded",
                message:
                  "under-recorded, ручная проверка: оплачено rent меньше суммы аренды — это недосбор/долг, не фантом.",
                paidRent: before.paidRent,
                rentalSum,
              },
            };
          }

          let capped = false;

          if (action === "delete_payment") {
            // paymentId гарантирован выше для этого экшена.
            const targetId = paymentId as number;
            // before.rows уже отфильтрованы type='rent' AND rentalId — find
            // по ним валидирует принадлежность аренде И тип одновременно.
            const target = before.rows.find((p) => p.id === targetId);
            if (!target) {
              return {
                kind: "error",
                code: 400,
                body: {
                  error: "payment_not_eligible",
                  message:
                    "Платёж не найден среди rent-платежей этой аренды (или это не type='rent').",
                },
              };
            }
            await tx.delete(payments).where(eq(payments.id, targetId));
          } else {
            // trim_latest: режем последний (max id) rent-платёж.
            // rows отсортированы по id возр. → последний = max id.
            const latest = before.rows[before.rows.length - 1];
            if (!latest) {
              return {
                kind: "error",
                code: 409,
                body: {
                  error: "no_rent_payments",
                  message: "У аренды нет rent-платежей — нечего срезать.",
                },
              };
            }
            // overBy >= 0 — выше мы отсекли paidRent < rentalSum. Если == ,
            // diff=0 (нечего резать, но не ошибка: amount не изменится).
            const overBy = before.paidRent - rentalSum;
            let newAmount = latest.amount - overBy;
            if (newAmount < 0) {
              // Уйти в минус нельзя — режем до 0 и сообщаем (capped).
              newAmount = 0;
              capped = true;
            }
            await tx
              .update(payments)
              .set({ amount: newAmount })
              .where(eq(payments.id, latest.id));
          }

          const after = await loadRentPayments(tx, rentalId);
          return {
            kind: "ok",
            before: { paidRent: before.paidRent, rentalSum },
            after: { paidRent: after.paidRent, rentalSum },
            capped,
          };
        },
      );

      if (result.kind === "error") {
        return reply.code(result.code).send(result.body);
      }

      // Лог в журнал действий (вне транзакции — logActivity best-effort/silent).
      const verb =
        action === "delete_payment"
          ? `удалён rent-платёж #${paymentId}`
          : "срезан последний rent-платёж";
      await logActivity(req, {
        entity: "rental",
        entityId: rentalId,
        action: "payment_reconciled",
        summary:
          `Ревизор: ${verb} по аренде #${rentalId}. ` +
          `Оплачено rent ${result.before.paidRent} → ${result.after.paidRent} ₽ ` +
          `(сумма аренды ${result.after.rentalSum} ₽)` +
          (result.capped ? " — упёрлись в 0, проверьте вручную" : ""),
        meta: {
          action,
          paymentId: paymentId ?? null,
          before: result.before,
          after: result.after,
          capped: result.capped,
        },
      });

      return {
        ok: true,
        before: result.before,
        after: result.after,
        capped: result.capped,
      };
    } catch (e) {
      req.log.error(
        { err: e, rentalId, action },
        "payment-reconcile apply failed",
      );
      return reply.code(500).send({
        error: "apply_failed",
        message: (e as Error).message ?? "unknown",
      });
    }
  });
}
