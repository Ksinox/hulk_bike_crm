import type { FastifyInstance } from "fastify";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  buyoutDeals,
  buyoutSchedule,
  clients,
  investors,
  scooters,
} from "../db/schema.js";
import { scooterLabel } from "./scooters.js";

/**
 * Напоминания (заказчик, 01.09).
 *
 * «Должна быть напоминалка: позвонить клиенту за день до платежа, и на
 * выплату инвесторам тоже». Смысл — не в списке дел, а в том, чтобы
 * менеджер узнал о событии ЗАРАНЕЕ, пока ещё можно что-то сделать.
 * Поэтому окно — завтра и сегодня, а просрочка едет отдельной, более
 * срочной строкой: там звонить нужно уже не «на всякий случай».
 *
 * Ничего не храним: напоминание — это производная от графика и настроек
 * выплат. Хранимый флаг «напомнили» неизбежно разъезжается с реальностью
 * (платёж внесли, сделку закрыли), а вычисленный — нет.
 */

type Reminder = {
  id: string;
  kind: "buyout_due" | "buyout_overdue" | "investor_payout";
  /** overdue — «уже горит», today — сегодня, soon — завтра. */
  urgency: "overdue" | "today" | "soon";
  title: string;
  subtitle: string;
  amount: number | null;
  date: string;
  /** Куда вести по клику. */
  link: { section: string; entityId: number } | null;
  phone: string | null;
};

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

/** Ближайшая дата выплаты инвестору — та же формула, что в разделе партнёров. */
function nextPayoutDate(period: string, day: number, now = new Date()): Date {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "month") {
    const dom = Math.min(Math.max(day, 1), 28);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), dom);
    return thisMonth.getTime() >= today.getTime()
      ? thisMonth
      : new Date(today.getFullYear(), today.getMonth() + 1, dom);
  }
  const jsDay = day % 7;
  const d = new Date(today);
  while (d.getDay() !== jsDay) d.setDate(d.getDate() + 1);
  return d;
}

export async function remindersRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    const now = new Date();
    const today = ymd(now);
    const tomorrow = ymd(new Date(now.getTime() + 86_400_000));

    const items: Reminder[] = [];

    /* --- Выкуп: платежи завтра, сегодня и просроченные --- */
    const rows = await db
      .select({
        dealId: buyoutSchedule.dealId,
        seq: buyoutSchedule.seq,
        dueDate: buyoutSchedule.dueDate,
        amount: buyoutSchedule.amount,
        paidAmount: buyoutSchedule.paidAmount,
        clientId: buyoutDeals.clientId,
        scooterId: buyoutDeals.scooterId,
      })
      .from(buyoutSchedule)
      .innerJoin(buyoutDeals, eq(buyoutSchedule.dealId, buyoutDeals.id))
      .where(
        and(
          eq(buyoutDeals.status, "active"),
          isNull(buyoutSchedule.paidAt),
          lte(buyoutSchedule.dueDate, tomorrow),
          sql`${buyoutSchedule.paidAmount} < ${buyoutSchedule.amount}`,
        ),
      )
      .orderBy(buyoutSchedule.dueDate);

    const clientIds = [...new Set(rows.map((r) => r.clientId).filter(Boolean))] as number[];
    const scooterIds = [...new Set(rows.map((r) => r.scooterId).filter(Boolean))] as number[];
    const clientById = new Map(
      clientIds.length
        ? (
            await db
              .select({ id: clients.id, name: clients.name, phone: clients.phone })
              .from(clients)
              .where(inArray(clients.id, clientIds))
          ).map((c) => [c.id, c])
        : [],
    );
    const scooterById = new Map(
      scooterIds.length
        ? (
            await db
              .select({ id: scooters.id, name: scooters.name, rentalSlot: scooters.rentalSlot })
              .from(scooters)
              .where(inArray(scooters.id, scooterIds))
          ).map((s) => [s.id, s])
        : [],
    );

    for (const r of rows) {
      const left = r.amount - r.paidAmount;
      if (left <= 0) continue;
      const client = r.clientId ? clientById.get(r.clientId) : null;
      const scooter = r.scooterId ? scooterById.get(r.scooterId) : null;
      const overdue = r.dueDate < today;
      const days = Math.max(
        0,
        Math.round(
          (new Date(today + "T00:00:00").getTime() -
            new Date(r.dueDate + "T00:00:00").getTime()) /
            86_400_000,
        ),
      );
      items.push({
        id: `buyout-${r.dealId}-${r.seq}`,
        kind: overdue ? "buyout_overdue" : "buyout_due",
        urgency: overdue ? "overdue" : r.dueDate === today ? "today" : "soon",
        title: client?.name ?? `Сделка №${r.dealId}`,
        subtitle: overdue
          ? `Платёж просрочен на ${days} ${days === 1 ? "день" : days < 5 ? "дня" : "дней"} · ${
              scooter ? scooterLabel(scooter.name, scooter.rentalSlot) : "выкуп"
            }`
          : r.dueDate === today
            ? `Платёж сегодня · ${scooter ? scooterLabel(scooter.name, scooter.rentalSlot) : "выкуп"}`
            : `Платёж завтра — позвонить и напомнить · ${scooter ? scooterLabel(scooter.name, scooter.rentalSlot) : "выкуп"}`,
        amount: left,
        date: r.dueDate,
        link: { section: "rassrochki", entityId: r.dealId },
        phone: client?.phone ?? null,
      });
    }

    /* --- Инвесторы: день выплаты сегодня или завтра --- */
    const invs = await db
      .select({
        id: investors.id,
        name: investors.name,
        phone: investors.phone,
        period: investors.payoutPeriod,
        day: investors.payoutDay,
      })
      .from(investors)
      .where(isNull(investors.deletedAt));

    for (const inv of invs) {
      const due = ymd(nextPayoutDate(inv.period, inv.day ?? 1, now));
      if (due !== today && due !== tomorrow) continue;
      items.push({
        id: `investor-${inv.id}`,
        kind: "investor_payout",
        urgency: due === today ? "today" : "soon",
        title: inv.name,
        subtitle:
          due === today
            ? "Сегодня день выплаты инвестору"
            : "Завтра день выплаты инвестору — подготовить деньги",
        amount: null,
        date: due,
        link: { section: "partners", entityId: inv.id },
        phone: inv.phone ?? null,
      });
    }

    const rank = { overdue: 0, today: 1, soon: 2 } as const;
    items.sort((a, b) => rank[a.urgency] - rank[b.urgency] || a.date.localeCompare(b.date));

    return {
      items,
      counts: {
        total: items.length,
        overdue: items.filter((i) => i.urgency === "overdue").length,
        today: items.filter((i) => i.urgency === "today").length,
        soon: items.filter((i) => i.urgency === "soon").length,
      },
      summary: {
        buyoutAmount: items
          .filter((i) => i.kind !== "investor_payout")
          .reduce((s, i) => s + (i.amount ?? 0), 0),
      },
    };
  });
}
