/**
 * v0.7: API для работы с anchor'ами расчётного периода.
 *
 *   GET  /api/billing-period/anchors      — список (любой авторизованный)
 *   GET  /api/billing-period/current      — резолв на now() (любой)
 *   POST /api/billing-period/anchors      — переключить правило
 *                                           (creator/director/admin)
 *
 * При POST сервер:
 *   1) Берёт текущее правило (последний anchor по effective_from).
 *   2) Если новое == текущее — 400.
 *   3) Если сейчас идёт переходный (transition_end >= today) — 400.
 *   4) Считает раскладку через planTransition(today, currentRule, newRule).
 *   5) Вставляет один anchor kind='transition', effective_from =
 *      transitionStart, transition_end_date = transitionEnd,
 *      rule_start_day = newRule.
 *   6) Параллельно обновляет app_settings.billing_period_start_day —
 *      для обратной совместимости со старыми клиентами и для отображения
 *      «текущего правила» в /settings.
 *   7) Пишет activity_log.
 */
import type { FastifyInstance } from "fastify";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { appSettings, billingPeriodAnchors } from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";
import {
  currentRuleStartDay,
  isTransitionActive,
  periodFor,
  planTransition,
  toISODate,
  type BillingAnchorRow,
} from "../services/billingPeriod.js";

function rowToAnchor(r: {
  id: number;
  effectiveFrom: string;
  ruleStartDay: number;
  kind: string;
  transitionEndDate: string | null;
}): BillingAnchorRow {
  return {
    id: r.id,
    effectiveFrom: r.effectiveFrom,
    ruleStartDay: r.ruleStartDay,
    kind: r.kind === "transition" ? "transition" : "regular",
    transitionEndDate: r.transitionEndDate ?? null,
  };
}

async function loadAnchors(): Promise<BillingAnchorRow[]> {
  const rows = await db
    .select()
    .from(billingPeriodAnchors)
    .orderBy(asc(billingPeriodAnchors.effectiveFrom));
  return rows.map(rowToAnchor);
}

export async function billingPeriodRoutes(app: FastifyInstance) {
  app.get("/anchors", async () => {
    const anchors = await loadAnchors();
    return { items: anchors };
  });

  app.get("/current", async () => {
    const anchors = await loadAnchors();
    const now = new Date();
    const period = periodFor(now, anchors);
    const transition = isTransitionActive(anchors, now);
    return {
      ruleStartDay: currentRuleStartDay(anchors),
      period: {
        start: toISODate(period.start),
        end: toISODate(period.end),
        kind: period.kind,
        ruleStartDay: period.ruleStartDay,
        label: period.label,
      },
      transitionActive: transition.active,
    };
  });

  app.post<{ Body: { newStartDay: number } }>(
    "/anchors",
    async (req, reply) => {
      const allowed = ["director", "creator", "admin"] as const;
      if (!allowed.includes(req.user?.role as never)) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const Body = z.object({
        newStartDay: z.number().int().min(1).max(28),
      });
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      }

      const anchors = await loadAnchors();
      const newRule = parsed.data.newStartDay;
      const today = new Date();

      const activeTransition = isTransitionActive(anchors, today);
      if (activeTransition.active) {
        return reply.code(400).send({
          error: "transition_in_progress",
          message:
            "Дождитесь окончания переходного периода (" +
            activeTransition.anchor.transitionEndDate +
            "), затем переключите ещё раз.",
        });
      }

      const currentRule = currentRuleStartDay(anchors);
      if (currentRule === newRule) {
        return reply.code(400).send({
          error: "same_rule",
          message:
            "Текущее правило старта расчётного периода уже " +
            currentRule +
            ". Нечего переключать.",
        });
      }

      const plan = planTransition(today, currentRule, newRule);
      // planTransition возвращает null только если cr === nr — мы это уже проверили
      if (!plan) {
        return reply.code(400).send({ error: "same_rule" });
      }

      const userId = req.user.userId ?? null;
      const [inserted] = await db
        .insert(billingPeriodAnchors)
        .values({
          effectiveFrom: toISODate(plan.transitionStart),
          ruleStartDay: newRule,
          kind: "transition",
          transitionEndDate: toISODate(plan.transitionEnd),
          createdByUserId: userId,
        })
        .returning();

      // Зеркалим в app_settings для обратной совместимости и для UI.
      const existing = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, "billing_period_start_day"));
      if (existing.length > 0) {
        await db
          .update(appSettings)
          .set({ value: String(newRule), updatedByUserId: userId })
          .where(eq(appSettings.key, "billing_period_start_day"));
      } else {
        await db.insert(appSettings).values({
          key: "billing_period_start_day",
          value: String(newRule),
          updatedByUserId: userId,
        });
      }

      await logActivity(req, {
        entity: "user",
        action: "billing_period_switch",
        summary:
          "Расчётный период " +
          currentRule +
          " → " +
          newRule +
          ". Переходный: " +
          toISODate(plan.transitionStart) +
          " — " +
          toISODate(plan.transitionEnd) +
          ". С " +
          toISODate(plan.firstNewPeriod.start) +
          " — новая схема.",
        meta: {
          fromRule: currentRule,
          toRule: newRule,
          transitionStart: toISODate(plan.transitionStart),
          transitionEnd: toISODate(plan.transitionEnd),
          firstNewPeriodStart: toISODate(plan.firstNewPeriod.start),
        } as unknown as object,
      });

      return {
        anchor: rowToAnchor(inserted!),
        plan: {
          currentPeriod: {
            start: toISODate(plan.currentPeriod.start),
            end: toISODate(plan.currentPeriod.end),
          },
          transitionStart: toISODate(plan.transitionStart),
          transitionEnd: toISODate(plan.transitionEnd),
          firstNewPeriodStart: toISODate(plan.firstNewPeriod.start),
        },
      };
    },
  );
}
