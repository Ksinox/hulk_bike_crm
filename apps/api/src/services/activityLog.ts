/**
 * Журнал действий пользователей.
 *
 * Всё что мы хотим показать в ленте «Последние действия» на дашборде —
 * пишется сюда. Обычно из route-handler'а:
 *   await logActivity(req, { entity: 'rental', entityId: 12, action: 'created',
 *     summary: 'Аренда #12 создана для клиента Вася П.' })
 */
import type { FastifyRequest } from "fastify";
import { db } from "../db/index.js";
import { activityLog, users } from "../db/schema.js";
import { eq } from "drizzle-orm";

export type ActivityEntity =
  | "client"
  | "scooter"
  | "rental"
  | "payment"
  | "user"
  | "model"
  | "equipment"
  | "maintenance"
  | "incident"
  | "price_group"
  | "price_item"
  | "damage_report"
  | "document_template"
  | "repair_job";

export type ActivityInput = {
  entity: ActivityEntity;
  entityId?: number | null;
  action: string;
  summary: string;
  meta?: unknown;
};

/**
 * Пишет запись в журнал. Silent — не бросает исключения, только логирует.
 * Чтобы не ломать основную операцию если лог упал.
 */
export async function logActivity(
  req: FastifyRequest | null,
  input: ActivityInput,
): Promise<void> {
  try {
    let userId: number | null = null;
    let userName = "система";
    let userRole: string | null = null;
    if (req && req.user) {
      userId = req.user.userId;
      userRole = req.user.role;
      // Берём актуальное имя из БД (юзер мог поменять name в профиле)
      const [u] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, userId));
      userName = u?.name ?? req.user.login ?? "система";
    }

    await db.insert(activityLog).values({
      userId,
      userName,
      userRole,
      entity: input.entity,
      entityId: input.entityId ?? null,
      action: input.action,
      summary: input.summary,
      meta: (input.meta ?? null) as unknown as object,
    });
  } catch (e) {
    req?.log?.warn({ err: e, input }, "activity log write failed");
  }
}
