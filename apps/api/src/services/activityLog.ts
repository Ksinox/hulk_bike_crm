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

/**
 * v0.6.6: структурированный diff для ленты событий.
 * Каждое поле описывает «было → стало» — фронт рендерит как
 * red-strike → green-pill. kind определяет форматирование.
 */
export type DiffFieldKind = "money" | "date" | "list" | "text" | "number";
export type DiffField = {
  label: string;
  from: unknown;
  to: unknown;
  kind: DiffFieldKind;
  /** Опционально для number: «дн», «км» и т.п. */
  suffix?: string;
};
export type DiffPayload = Record<string, DiffField>;

export type ActivityInput = {
  entity: ActivityEntity;
  entityId?: number | null;
  action: string;
  summary: string;
  meta?: unknown;
  /**
   * v0.6.6: структурированный diff. Сохраняется как `meta.diff`
   * (поверх существующего meta, не затирает other поля). Фронт читает
   * через item.meta.diff и рендерит «было → стало».
   */
  diff?: DiffPayload;
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

    // v0.6.6: если передан diff — мержим его в meta как `meta.diff`,
    // сохраняя existing fields. Если meta не передан вообще — { diff: ... }.
    let metaToStore: unknown = input.meta ?? null;
    if (input.diff) {
      if (metaToStore && typeof metaToStore === "object") {
        metaToStore = { ...(metaToStore as Record<string, unknown>), diff: input.diff };
      } else {
        metaToStore = { diff: input.diff };
      }
    }

    await db.insert(activityLog).values({
      userId,
      userName,
      userRole,
      entity: input.entity,
      entityId: input.entityId ?? null,
      action: input.action,
      summary: input.summary,
      meta: (metaToStore ?? null) as unknown as object,
    });
  } catch (e) {
    req?.log?.warn({ err: e, input }, "activity log write failed");
  }
}
