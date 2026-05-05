import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  activityLog,
  rentals,
  damageReports,
  payments,
} from "../db/schema.js";

/**
 * GET /api/activity?limit=50&offset=0
 * Лента последних действий. Видна всем авторизованным ролям.
 * Возвращает items + total чтобы UI мог пагинировать полный журнал.
 */
export async function activityRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { limit?: string; offset?: string } }>(
    "/",
    async (req) => {
      const Q = z.object({
        limit: z.coerce.number().int().min(1).max(500).optional(),
        offset: z.coerce.number().int().min(0).optional(),
      });
      const parsed = Q.safeParse(req.query);
      const limit = parsed.success && parsed.data.limit ? parsed.data.limit : 50;
      const offset = parsed.success && parsed.data.offset ? parsed.data.offset : 0;

      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(activityLog)
          .orderBy(desc(activityLog.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(activityLog),
      ]);

      return { items: rows, total: totalRow[0]?.count ?? 0 };
    },
  );

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
