import type { FastifyInstance } from "fastify";
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  activityLog,
  rentals,
  damageReports,
  payments,
  debtors,
} from "../db/schema.js";

/**
 * Категории фильтра «Весь журнал» → условие по action/entity. Ключи совпадают
 * с фронтом (ActivityFeed.tsx JOURNAL_CATEGORIES). Ущерб ловим и по entity
 * (damage_report), т.к. его action='created'.
 */
function categoryCondition(cat: string): SQL | undefined {
  const A = activityLog.action;
  const E = activityLog.entity;
  switch (cat) {
    case "created":
      return and(eq(E, "rental"), eq(A, "created"));
    case "payment":
      return or(ilike(A, "%payment%"), ilike(A, "%paid%"), eq(A, "debt_payment"));
    case "extend":
      return ilike(A, "%extend%");
    case "swap":
      return ilike(A, "%swap%");
    case "equipment":
      return ilike(A, "%equipment%");
    case "damage":
      return or(
        eq(E, "damage_report"),
        ilike(A, "%damage%"),
        ilike(A, "%debt%"),
        ilike(A, "%overdue%"),
        ilike(A, "%forgiv%"),
      );
    case "complete":
      return or(ilike(A, "%complet%"), ilike(A, "%status%"));
    case "rollback":
      return or(ilike(A, "%rolled_back%"), eq(A, "revert_completion"));
    default:
      return undefined;
  }
}

/**
 * GET /api/activity?limit=50&offset=0&from=YYYY-MM-DD&to=YYYY-MM-DD&category=...
 * Лента последних действий. Видна всем авторизованным ролям.
 * Возвращает items + total чтобы UI мог пагинировать полный журнал.
 * from/to/category — серверная фильтрация для модалки «Весь журнал»
 * (фильтровать надо ДО пагинации, поэтому на сервере, не на клиенте).
 */
export async function activityRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: {
      limit?: string;
      offset?: string;
      from?: string;
      to?: string;
      category?: string;
      role?: string;
    };
  }>("/", async (req) => {
    const Q = z.object({
      limit: z.coerce.number().int().min(1).max(500).optional(),
      offset: z.coerce.number().int().min(0).optional(),
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      category: z
        .enum([
          "created",
          "payment",
          "extend",
          "swap",
          "equipment",
          "damage",
          "complete",
          "rollback",
        ])
        .optional(),
      // Фильтр по исполнителю (роли): director / admin / creator / mechanic / accountant.
      role: z.string().max(40).optional(),
    });
    const parsed = Q.safeParse(req.query);
    const data = parsed.success ? parsed.data : {};
    const limit = data.limit ?? 50;
    const offset = data.offset ?? 0;

    const conds: SQL[] = [];
    if (data.from) {
      conds.push(gte(activityLog.createdAt, new Date(`${data.from}T00:00:00.000Z`)));
    }
    if (data.to) {
      const t = new Date(`${data.to}T00:00:00.000Z`);
      t.setUTCDate(t.getUTCDate() + 1); // включительно по конец дня
      conds.push(lt(activityLog.createdAt, t));
    }
    if (data.category) {
      const c = categoryCondition(data.category);
      if (c) conds.push(c);
    }
    if (data.role) {
      conds.push(eq(activityLog.userRole, data.role));
    }
    const whereCond = conds.length ? and(...conds) : undefined;

    const [rows, totalRow] = await Promise.all([
      db
        .select()
        .from(activityLog)
        .where(whereCond)
        .orderBy(desc(activityLog.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityLog)
        .where(whereCond),
    ]);

    return { items: rows, total: totalRow[0]?.count ?? 0 };
  });

  /**
   * v0.4.5: «лента событий» по сущности — для табов «История» в карточках
   * аренды/скутера/клиента. Возвращает связанные записи activity_log,
   * включая косвенные (например для скутера — все аренды и их события).
   *
   * GET /api/activity/timeline?entity=rental&id=42
   * GET /api/activity/timeline?entity=scooter&id=7
   * GET /api/activity/timeline?entity=client&id=15
   *
   * Сортировка: новые сверху. limit по умолчанию 200.
   */
  app.get<{ Querystring: { entity?: string; id?: string; limit?: string } }>(
    "/timeline",
    async (req, reply) => {
      const Q = z.object({
        entity: z.enum(["rental", "scooter", "client"]),
        id: z.coerce.number().int().positive(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
      });
      const parsed = Q.safeParse(req.query);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      }
      const { entity, id } = parsed.data;
      const limit = parsed.data.limit ?? 200;

      // Соберём множества id, по которым ищем activity_log:
      //  - rentalIds — ВСЕ аренды цепочки (для rental — корень+потомки;
      //                для скутера — все аренды на этот скутер;
      //                для клиента — все его аренды).
      //  - damageReportIds — все акты по этим арендам.
      //  - paymentIds — все платежи (для активити-логов о подтверждениях).
      const rentalIds = new Set<number>();
      const damageReportIds = new Set<number>();
      const debtorIds = new Set<number>();
      const directEntityFilter: Array<{ entity: string; id: number }> = [];

      if (entity === "rental") {
        // Поднимаемся к корню по parentRentalId, потом обходим потомков.
        // Делаем двумя простыми запросами вместо рекурсивного CTE — кейсов
        // с глубиной >5 в проде не бывает.
        let cursorId: number | null = id;
        const visited = new Set<number>();
        // вверх до корня
        while (cursorId != null && !visited.has(cursorId)) {
          visited.add(cursorId);
          const [r] = await db
            .select({ id: rentals.id, parent: rentals.parentRentalId })
            .from(rentals)
            .where(eq(rentals.id, cursorId));
          if (!r) break;
          rentalIds.add(r.id);
          cursorId = r.parent ?? null;
        }
        // вниз — все где parent IN rentalIds (1 уровень потомков, повторяем
        // пока есть новые)
        let frontier = Array.from(rentalIds);
        for (let i = 0; i < 8 && frontier.length; i++) {
          const children = await db
            .select({ id: rentals.id })
            .from(rentals)
            .where(inArray(rentals.parentRentalId, frontier));
          const next: number[] = [];
          for (const c of children) {
            if (!rentalIds.has(c.id)) {
              rentalIds.add(c.id);
              next.push(c.id);
            }
          }
          frontier = next;
        }
        directEntityFilter.push({ entity: "rental", id });
      } else if (entity === "scooter") {
        const rs = await db
          .select({ id: rentals.id })
          .from(rentals)
          .where(eq(rentals.scooterId, id));
        for (const r of rs) rentalIds.add(r.id);
        directEntityFilter.push({ entity: "scooter", id });
      } else if (entity === "client") {
        const rs = await db
          .select({ id: rentals.id })
          .from(rentals)
          .where(eq(rentals.clientId, id));
        for (const r of rs) rentalIds.add(r.id);
        // v0.6: дела-должники клиента — их события (заведение, платежи,
        // смена стадии, закрытие) показываем в истории клиента. Так директор
        // видит в карточке, что клиент был в «Должниках» и как с ним работали.
        const ds = await db
          .select({ id: debtors.id })
          .from(debtors)
          .where(eq(debtors.clientId, id));
        for (const d of ds) debtorIds.add(d.id);
        directEntityFilter.push({ entity: "client", id });
      }

      // Подтягиваем damage_reports по найденным арендам — чтобы пройти
      // их activity_log тоже (entity='damage_report').
      if (rentalIds.size > 0) {
        const dReports = await db
          .select({ id: damageReports.id })
          .from(damageReports)
          .where(inArray(damageReports.rentalId, Array.from(rentalIds)));
        for (const d of dReports) damageReportIds.add(d.id);
      }

      // Сборка WHERE для activity_log:
      //   entity in ('rental') AND entityId IN rentalIds
      //   OR
      //   entity in ('damage_report') AND entityId IN damageReportIds
      //   OR
      //   directEntityFilter (rental/scooter/client с переданным id —
      //   на случай событий с прямым match)
      const orParts = [];
      if (rentalIds.size > 0) {
        orParts.push(
          and(
            eq(activityLog.entity, "rental"),
            inArray(activityLog.entityId, Array.from(rentalIds)),
          ),
        );
      }
      if (damageReportIds.size > 0) {
        orParts.push(
          and(
            eq(activityLog.entity, "damage_report"),
            inArray(
              activityLog.entityId,
              Array.from(damageReportIds),
            ),
          ),
        );
      }
      if (debtorIds.size > 0) {
        orParts.push(
          and(
            eq(activityLog.entity, "debtor"),
            inArray(activityLog.entityId, Array.from(debtorIds)),
          ),
        );
      }
      for (const f of directEntityFilter) {
        orParts.push(
          and(
            eq(activityLog.entity, f.entity),
            eq(activityLog.entityId, f.id),
          ),
        );
      }

      if (orParts.length === 0) return { items: [] };
      const rows = await db
        .select()
        .from(activityLog)
        .where(and(or(...orParts), isNotNull(activityLog.entityId)))
        .orderBy(desc(activityLog.createdAt))
        .limit(limit);
      // Доп.инфа в meta — добавим связанный rentalId/scooterId/clientId
      // на клиенте по контексту, тут отдаём как есть.
      void payments; // payments-events идут через rental-связь
      return {
        items: rows,
        rentalIds: Array.from(rentalIds),
        damageReportIds: Array.from(damageReportIds),
      };
    },
  );
}
