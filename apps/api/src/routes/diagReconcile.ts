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
 * ── Что входит в rentals.sum ──
 * Сумму аренды двигают ТОЛЬКО эти rent-платежи:
 *   • первоначалка    («оплата аренды … при создании») — sum := amount;
 *   • продление       («продление на N дн …»)           — sum += amount;
 *   • выкуп просрочки  («Оплата N дн просрочки …»)       — sum += amount.
 * А вот ручной долг («Оплата ручного долга …») пишется как payment(type=rent)
 * для выручки, но rentals.sum НЕ двигает (это доход вне базовой аренды).
 *
 * Поэтому ВЕРНЫЙ инвариант для НЕ-архивной аренды:
 *   Σ(paid rent, КРОМЕ «ручного долга»).amount === rentals.sum
 *
 * (Старая наивная версия сравнивала Σ ВСЕХ rent с sum и давала ложные
 *  срабатывания на каждой аренде с ручным долгом — могла «починкой»
 *  срезать живой доход. Теперь ручной долг исключён из инварианта, а
 *  чинить разрешено ТОЛЬКО базовые платежи (первоначалка/продление) —
 *  именно их фантомит старая «Изменить аренду». Выкуп просрочки и ручной
 *  долг — реальный доход, ревизор их НЕ трогает.)
 *
 * GET  /api/_diag/payment-reconcile        — DRY-RUN, только чтение, аудит-лист.
 * POST /api/_diag/payment-reconcile/apply  — точечный фикс ПЕРЕ-записанной аренды
 *                                            (effectivePaidRent > sum), в транзакции,
 *                                            трогаем ТОЛЬКО базовые rent-платежи.
 */

/** Только creator/director. Зеркалит гейт из rentals.ts (DELETE /:id). */
function isCreatorOrDirector(role: string): boolean {
  return role === "creator" || role === "director";
}

/** Ручной долг — rent-платёж, который НЕ входит в rentals.sum. */
const MANUAL_DEBT_NOTE_RE = /ручн\w*\s+долг/i;
/** Выкуп просрочки — входит в sum, но НЕ базовый период (не фантомится). */
const OVERDUE_NOTE_RE = /просрочк/i;
/** Продление — базовый период, источник фантомов «Изменить аренду». */
const EXTEND_NOTE_RE = /продлени[ея]\s+на\s+\d+\s*дн/i;

type RentKind = "base" | "extend" | "overdue" | "manual";

/**
 * Классификация rent-платежа по заметке:
 *   • manual  — ручной долг (вне sum, НЕ трогаем);
 *   • overdue — выкуп просрочки (в sum, реальный доход, НЕ трогаем);
 *   • extend  — продление (в sum, базовый период — фантомится);
 *   • base    — первоначалка / reconcile без заметки (в sum, базовый период).
 */
function classifyRent(note: string | null): RentKind {
  const n = note ?? "";
  if (MANUAL_DEBT_NOTE_RE.test(n)) return "manual";
  if (OVERDUE_NOTE_RE.test(n)) return "overdue";
  if (EXTEND_NOTE_RE.test(n)) return "extend";
  return "base";
}

/** Входит ли платёж в инвариант (двигает ли он rentals.sum). Всё, кроме ручного долга. */
function contributesToSum(kind: RentKind): boolean {
  return kind !== "manual";
}

/** Базовый период (первоначалка/продление) — ТОЛЬКО эти ревизор вправе чинить. */
function isFixable(kind: RentKind): boolean {
  return kind === "base" || kind === "extend";
}

type RentPaymentRow = {
  id: number;
  amount: number;
  paid: boolean;
  note: string | null;
  kind: RentKind;
};

/** Тип tx-объекта внутри db.transaction (как в parking.ts). */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Собирает все rent-платежи (любой paid) одной аренды, упорядоченные по id,
 * с классификацией. effectivePaidRent = Σ(paid И входящих в sum) — то, что
 * по инварианту должно равняться rentals.sum.
 */
async function loadRentPayments(
  exec: Tx,
  rentalId: number,
): Promise<{ rows: RentPaymentRow[]; effectivePaidRent: number }> {
  const raw = await exec
    .select({
      id: payments.id,
      amount: payments.amount,
      paid: payments.paid,
      note: payments.note,
    })
    .from(payments)
    .where(and(eq(payments.rentalId, rentalId), eq(payments.type, "rent")))
    .orderBy(payments.id);
  const rows: RentPaymentRow[] = raw.map((p) => ({
    id: p.id,
    amount: p.amount,
    paid: p.paid,
    note: p.note,
    kind: classifyRent(p.note),
  }));
  const effectivePaidRent = rows.reduce(
    (s, p) => s + (p.paid && contributesToSum(p.kind) ? (p.amount ?? 0) : 0),
    0,
  );
  return { rows, effectivePaidRent };
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
      before: { effectivePaidRent: number; rentalSum: number };
      after: { effectivePaidRent: number; rentalSum: number };
      capped: boolean;
    };

export async function diagReconcileRoutes(app: FastifyInstance) {
  /**
   * GET /api/_diag/payment-reconcile — DRY-RUN, read-only.
   *
   * Для каждой НЕ-архивной аренды сравнивает effectivePaidRent
   * (Σ оплаченных rent-платежей КРОМЕ ручного долга) с rentals.sum.
   * Возвращает список расхождений, отсортированный по |diff| убыв.
   * Ничего не пишет в БД. По каждому платежу — kind (base/extend/overdue/
   * manual) и fixable, чтобы было видно ЧТО можно срезать.
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
      list.push({
        id: p.id,
        amount: p.amount,
        paid: p.paid,
        note: p.note,
        kind: classifyRent(p.note),
      });
      byRental.set(p.rentalId, list);
    }

    const mismatches: Array<{
      rentalId: number;
      clientName: string | null;
      rentalSum: number;
      effectivePaidRent: number;
      diff: number;
      /** Σ по видам — чтобы понять природу расхождения. */
      breakdown: { base: number; extend: number; overdue: number; manual: number };
      rentPaymentCount: number;
      extended: boolean;
      rentPayments: RentPaymentRow[];
    }> = [];

    for (const r of rentalRows) {
      const list = byRental.get(r.rentalId) ?? [];
      const effectivePaidRent = list.reduce(
        (s, p) =>
          s + (p.paid && contributesToSum(p.kind) ? (p.amount ?? 0) : 0),
        0,
      );
      const diff = effectivePaidRent - r.rentalSum;
      if (diff === 0) continue;
      const breakdown = { base: 0, extend: 0, overdue: 0, manual: 0 };
      for (const p of list) {
        if (p.paid) breakdown[p.kind] += p.amount ?? 0;
      }
      mismatches.push({
        rentalId: r.rentalId,
        clientName: r.clientName,
        rentalSum: r.rentalSum,
        effectivePaidRent,
        diff,
        breakdown,
        rentPaymentCount: list.length,
        extended: list.some((p) => p.kind === "extend"),
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
   *  • trim_latest    — для ПЕРЕ-записанной аренды (effectivePaidRent > sum)
   *                     уменьшает ПОСЛЕДНИЙ БАЗОВЫЙ rent-платёж (первоначалка/
   *                     продление, max id) так, чтобы Σ=sum. Если ушло бы в
   *                     минус — режет до 0 и сообщает (capped).
   *  • delete_payment — жёстко удаляет указанный БАЗОВЫЙ rent-платёж (фантом).
   *                     Проверяем, что он принадлежит аренде, type='rent' И
   *                     это базовый период (не выкуп просрочки / не ручной долг).
   *
   * Защита: только creator/director, всё в db.transaction. Трогаем ТОЛЬКО
   * базовые rent-платежи (kind base/extend) — выкуп просрочки и ручной долг
   * это реальный доход, ревизор их не касается. НЕДО-записанные аренды
   * (effectivePaidRent < sum — долг/недосбор) НЕ чиним: ошибка под-запись.
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
          if (before.effectivePaidRent < rentalSum) {
            return {
              kind: "error",
              code: 409,
              body: {
                error: "under_recorded",
                message:
                  "under-recorded, ручная проверка: оплачено rent (без ручного долга) меньше суммы аренды — это недосбор/долг, не фантом.",
                effectivePaidRent: before.effectivePaidRent,
                rentalSum,
              },
            };
          }

          let capped = false;

          if (action === "delete_payment") {
            const targetId = paymentId as number;
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
            // Защита дохода: ревизор не удаляет выкуп просрочки / ручной долг.
            if (!isFixable(target.kind)) {
              return {
                kind: "error",
                code: 409,
                body: {
                  error: "payment_protected",
                  message: `Этот платёж — «${target.kind === "manual" ? "ручной долг" : "выкуп просрочки"}», реальный доход. Ревизор удаляет только фантомы базового периода (первоначалка/продление).`,
                },
              };
            }
            await tx.delete(payments).where(eq(payments.id, targetId));
          } else {
            // trim_latest: режем последний БАЗОВЫЙ (first/extend) rent-платёж.
            const fixable = before.rows.filter((p) => isFixable(p.kind));
            const latest = fixable[fixable.length - 1];
            if (!latest) {
              return {
                kind: "error",
                code: 409,
                body: {
                  error: "no_fixable_payment",
                  message:
                    "Нет базовых rent-платежей (первоначалка/продление) для среза — расхождение не из фантома базового периода, нужна ручная проверка.",
                },
              };
            }
            // overBy >= 0 — выше отсекли effectivePaidRent < rentalSum.
            const overBy = before.effectivePaidRent - rentalSum;
            let newAmount = latest.amount - overBy;
            if (newAmount < 0) {
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
            before: {
              effectivePaidRent: before.effectivePaidRent,
              rentalSum,
            },
            after: {
              effectivePaidRent: after.effectivePaidRent,
              rentalSum,
            },
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
          ? `удалён фантом-платёж #${paymentId}`
          : "срезан последний базовый rent-платёж";
      await logActivity(req, {
        entity: "rental",
        entityId: rentalId,
        action: "payment_reconciled",
        summary:
          `Ревизор: ${verb} по аренде #${rentalId}. ` +
          `Оплачено rent (без ручного долга) ${result.before.effectivePaidRent} → ${result.after.effectivePaidRent} ₽ ` +
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
