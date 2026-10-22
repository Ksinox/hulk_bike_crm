import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { activityLog, clients, payments, rentals, scooters } from "../db/schema.js";
import { scooterStatusLabel } from "./activityMessages.js";

/**
 * 22.10 (заказчик): «важно, как директор увидит операцию — максимально
 * понятно, чтобы быстро вникнуть и принять решение».
 *
 * Сводку собирает СЕРВЕР по самой операции (а не браузер сотрудника):
 * что за аренда / скутер / платёж, кто клиент, суммы, «было → стало».
 * Она подписывается вместе с привязкой к запросу (см. approvals.ts) —
 * подменить описание нельзя, и подтверждение годится только для неё.
 */

export type BriefFact = {
  label: string;
  /** Обычное значение. */
  value?: string;
  /** Для изменений: было → стало. */
  from?: string;
  to?: string;
};

export type ApprovalBrief = {
  /** Одна фраза: что произойдёт. */
  summary: string;
  facts: BriefFact[];
};

const rub = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;
const day = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const dayTime = (d: Date | null | undefined) =>
  d
    ? d.toLocaleString("ru-RU", {
        timeZone: "Europe/Moscow",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
export const rentalNo = (id: number) => `#${String(id).padStart(4, "0")}`;

export function scooterName(name: string, slot?: number | null): string {
  const model = name.replace(/\s*#\s*\d+\s*$/, "").trim() || name;
  return slot != null ? `${model} №${slot}` : model;
}

const PAYMENT_TYPE_RU: Record<string, string> = {
  rent: "аренда",
  deposit: "залог",
  fine: "штраф",
  damage: "ущерб",
  refund: "возврат",
  swap_fee: "доплата за замену",
  equipment_fee: "доплата за экипировку",
  parking: "паркинг",
};
const METHOD_RU: Record<string, string> = { cash: "наличные", transfer: "перевод", card: "карта" };

export async function scooterFacts(scooterId: number | null | undefined): Promise<{ name: string; facts: BriefFact[] }> {
  if (!scooterId) return { name: "скутер", facts: [] };
  const [s] = await db.select().from(scooters).where(eq(scooters.id, scooterId));
  if (!s) return { name: "скутер", facts: [] };
  const name = scooterName(s.name, s.rentalSlot);
  const id = (s.vin ?? "").trim().slice(-6);
  return {
    name,
    facts: [{ label: "Скутер", value: id ? `${name} · ID ${id}` : name }],
  };
}

export async function rentalFacts(rentalId: number): Promise<{ facts: BriefFact[]; scooterId: number | null }> {
  const [r] = await db.select().from(rentals).where(eq(rentals.id, rentalId));
  if (!r) return { facts: [{ label: "Аренда", value: rentalNo(rentalId) }], scooterId: null };
  const [c] = await db
    .select({ name: clients.name, phone: clients.phone })
    .from(clients)
    .where(eq(clients.id, r.clientId));
  const sc = await scooterFacts(r.scooterId);
  return {
    scooterId: r.scooterId,
    facts: [
      { label: "Аренда", value: `${rentalNo(r.id)} · ${day(r.startAt)} → ${day(r.endPlannedAt)} · ${r.days} дн` },
      ...(c ? [{ label: "Клиент", value: `${c.name} · ${c.phone}` }] : []),
      ...sc.facts,
      { label: "Сумма аренды", value: rub(r.sum) },
    ],
  };
}

export async function briefScooterStatus(
  scooterId: number,
  to: string,
  context?: string,
): Promise<ApprovalBrief> {
  const [s] = await db.select().from(scooters).where(eq(scooters.id, scooterId));
  const sc = await scooterFacts(scooterId);
  return {
    summary: `${context ? `${context}: ` : ""}${sc.name} переходит в «${scooterStatusLabel(to)}»`,
    facts: [
      ...sc.facts,
      { label: "Категория", from: s ? scooterStatusLabel(s.baseStatus) : "—", to: scooterStatusLabel(to) },
    ],
  };
}

export async function briefRentalScooterStatus(
  rentalId: number,
  scooterId: number,
  to: string,
  what: string,
): Promise<ApprovalBrief> {
  const [s] = await db.select().from(scooters).where(eq(scooters.id, scooterId));
  const rf = await rentalFacts(rentalId);
  const name = s ? scooterName(s.name, s.rentalSlot) : "скутер";
  return {
    summary: `${what} ${rentalNo(rentalId)}: ${name} уходит в «${scooterStatusLabel(to)}»`,
    facts: [
      ...rf.facts.filter((f) => f.label !== "Сумма аренды"),
      { label: "Категория скутера", from: s ? scooterStatusLabel(s.baseStatus) : "—", to: scooterStatusLabel(to) },
    ],
  };
}

export async function briefPayment(
  paymentId: number,
  change: { amount?: number; unpaid?: boolean; rollback?: boolean },
): Promise<ApprovalBrief> {
  const [p] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!p) return { summary: "Изменение платежа", facts: [] };
  const what = `${PAYMENT_TYPE_RU[p.type] ?? p.type}, ${METHOD_RU[p.method] ?? p.method}`;
  const rf = p.rentalId ? await rentalFacts(p.rentalId) : { facts: [] as BriefFact[] };
  const facts: BriefFact[] = [
    { label: "Платёж", value: `${rub(p.amount)} · ${what} · принят ${dayTime(p.paidAt ?? p.createdAt)}` },
    ...rf.facts.filter((f) => f.label === "Аренда" || f.label === "Клиент"),
  ];
  if (change.rollback) {
    return { summary: `Отменить принятый платёж ${rub(p.amount)} (${what})`, facts: [...facts, { label: "Выручка", from: rub(p.amount), to: rub(0) }] };
  }
  if (change.unpaid) facts.push({ label: "Отметка", from: "оплачен", to: "не оплачен" });
  if (change.amount !== undefined && change.amount !== p.amount)
    facts.push({ label: "Сумма", from: rub(p.amount), to: rub(change.amount) });
  return {
    summary: change.unpaid
      ? `Снять отметку «оплачен» с платежа ${rub(p.amount)}`
      : `Изменить сумму принятого платежа: ${rub(p.amount)} → ${rub(change.amount ?? p.amount)}`,
    facts,
  };
}

export async function briefRollbackAction(activityId: number): Promise<ApprovalBrief> {
  const [a] = await db.select().from(activityLog).where(eq(activityLog.id, activityId));
  if (!a) return { summary: "Отмена операции", facts: [] };
  return {
    summary: `Отменить операцию: ${a.summary}`,
    facts: [
      { label: "Операция", value: a.summary },
      { label: "Когда сделана", value: dayTime(a.createdAt) },
      { label: "Кто сделал", value: a.userName ?? "—" },
    ],
  };
}

export async function briefRentalDelete(rentalId: number, reason?: string | null): Promise<ApprovalBrief> {
  const rf = await rentalFacts(rentalId);
  return {
    summary: `Удалить аренду ${rentalNo(rentalId)} в архив`,
    facts: [...rf.facts, ...(reason ? [{ label: "Причина", value: reason }] : [])],
  };
}
