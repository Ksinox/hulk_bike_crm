/**
 * Seed БД демо-данными.
 *
 * Источник — моки из apps/web/src/lib/mock/*.
 * После того как фронт полностью перейдёт на API, моки из web удалим,
 * и этот seed останется единственным местом хранения demo-данных.
 *
 * Запуск:
 *   pnpm db:seed          — локально
 *   pnpm db:reset && pnpm db:migrate && pnpm db:seed — чистая переустановка
 *
 * В prod НЕ запускается — проверяется по NODE_ENV.
 */

import { sql } from "drizzle-orm";
import { closeDb, db } from "../db/index.js";
import {
  clients,
  payments,
  rentalIncidents,
  rentalTasks,
  rentals,
  scooters,
  type clientSourceEnum,
  type paymentMethodEnum,
  type paymentTypeEnum,
  type rentalSourceChannelEnum,
  type rentalStatusEnum,
  type scooterBaseStatusEnum,
  type scooterModelEnum,
  type tariffPeriodEnum,
} from "../db/schema.js";
import { isProd } from "../config.js";

// @ts-expect-error — импорт из web-пакета через относительный путь;
// tsx справляется с резолвом .ts; tsc в api это не тайпчекает (seed в exclude).
import { CLIENTS } from "../../../web/src/lib/mock/clients.ts";
// @ts-expect-error
import { RENTALS } from "../../../web/src/lib/mock/rentals.ts";
// @ts-expect-error
import { FLEET } from "../../../web/src/lib/mock/fleet.ts";

/* =========================== helpers =========================== */

type Client = typeof CLIENTS[number];
type Rental = typeof RENTALS[number];
type FleetScooter = typeof FLEET[number];

/** "03.04.26" → "2026-04-03" (паддинг века = 20XX) */
function parseShortDate(s: string): string {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{2,4})$/);
  if (!m) throw new Error(`Не парсится короткая дата: ${s}`);
  const [, d, mo, y] = m;
  const year = y!.length === 2 ? `20${y}` : y!;
  return `${year}-${mo}-${d}`;
}

/** "14.09.2026" → "2026-09-14" */
function parseDate(s: string): string {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) throw new Error(`Не парсится дата: ${s}`);
  const [, d, mo, y] = m;
  return `${y}-${mo}-${d}`;
}

/** "14.09.2026" + "12:00" → Date (в MSK = UTC+3) */
function parseDateTime(dateStr: string, time = "12:00"): Date {
  const iso = `${parseDate(dateStr)}T${time}:00+03:00`;
  return new Date(iso);
}

/** "13.10.2026 14:00" → Date */
function parseTaskDue(s: string): Date {
  const m = s.match(/^(\d{2}\.\d{2}\.\d{4})(?:\s+(\d{2}:\d{2}))?$/);
  if (!m) throw new Error(`Не парсится due: ${s}`);
  return parseDateTime(m[1]!, m[2] ?? "18:00");
}

type ClientSource =
  (typeof clientSourceEnum.enumValues)[number];
type ScooterModel = (typeof scooterModelEnum.enumValues)[number];
type ScooterBaseStatus =
  (typeof scooterBaseStatusEnum.enumValues)[number];
type RentalStatus = (typeof rentalStatusEnum.enumValues)[number];
type RentalSourceChannel =
  (typeof rentalSourceChannelEnum.enumValues)[number];
type TariffPeriod = (typeof tariffPeriodEnum.enumValues)[number];
type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];
type PaymentType = (typeof paymentTypeEnum.enumValues)[number];

function deriveChannel(source: ClientSource | undefined): RentalSourceChannel {
  switch (source) {
    case "avito":
      return "avito";
    case "repeat":
      return "repeat";
    case "ref":
      return "ref";
    case "maps":
      return "passing";
    default:
      return "other";
  }
}

/* =========================== seed =========================== */

async function main() {
  if (isProd) {
    console.error("✗ db:seed запрещён в production.");
    process.exit(1);
  }

  console.log("▶ Проверяем что БД пустая...");
  const existing = await db.select({ c: sql<number>`count(*)` }).from(clients);
  const n = Number(existing[0]?.c ?? 0);
  if (n > 0) {
    console.error(
      `✗ В таблице clients уже ${n} строк. Сначала сделай pnpm db:reset && pnpm db:migrate, потом db:seed.`,
    );
    process.exit(1);
  }

  console.log(`▶ clients: ${CLIENTS.length} записей`);
  await db.insert(clients).values(
    CLIENTS.map((c: Client) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      rating: c.rating,
      source: c.source as ClientSource,
      addedOn: parseShortDate(c.added),
      comment: c.comment,
      blacklisted: c.blacklisted ?? false,
      // Причина ЧС в моке не выставлена, но можно положить comment
      blacklistReason: c.blacklisted ? (c.comment ?? "причина не указана") : null,
    })),
  );

  console.log(`▶ scooters: ${FLEET.length} записей`);
  await db.insert(scooters).values(
    FLEET.map((s: FleetScooter) => ({
      id: s.id,
      name: s.name,
      model: s.model as ScooterModel,
      vin: s.vin,
      engineNo: s.engineNo,
      mileage: s.mileage,
      baseStatus: s.baseStatus as ScooterBaseStatus,
      purchaseDate: s.purchaseDate ? parseDate(s.purchaseDate) : null,
      purchasePrice: s.purchasePrice,
      lastOilChangeMileage: s.lastOilChangeMileage,
      note: s.note,
    })),
  );

  // Маппинг: scooter name → scooter id (из базы, т.к. id 1:1 с FLEET)
  const scooterByName = new Map<string, number>();
  for (const s of FLEET) scooterByName.set(s.name, s.id);

  console.log(`▶ rentals: ${RENTALS.length} записей`);
  await db.insert(rentals).values(
    RENTALS.map((r: Rental) => {
      const client = CLIENTS.find((c: Client) => c.id === r.clientId);
      const scooterId = scooterByName.get(r.scooter) ?? null;
      return {
        id: r.id,
        clientId: r.clientId,
        scooterId,
        parentRentalId: r.parentRentalId ?? null,
        status: r.status as RentalStatus,
        sourceChannel:
          r.sourceChannel ?? deriveChannel(client?.source as ClientSource),
        tariffPeriod: r.tariffPeriod as TariffPeriod,
        rate: r.rate,
        deposit: r.deposit || 2000,
        depositReturned: r.depositReturned ?? null,
        startAt: parseDateTime(r.start, r.startTime),
        endPlannedAt:
          r.endPlanned === "—"
            ? parseDateTime(r.start, r.startTime)
            : parseDateTime(r.endPlanned, r.startTime),
        endActualAt: r.endActual ? parseDateTime(r.endActual, r.startTime) : null,
        days: r.days,
        sum: r.sum,
        paymentMethod: r.paymentMethod as PaymentMethod,
        contractUploaded: r.contractUploaded ?? false,
        equipment: r.equipment ?? [],
        damageAmount: r.damageAmount ?? null,
        note: r.note,
      };
    }),
  );

  /* ----- платежи (повторяем логику seedPayments из web) ----- */
  console.log("▶ payments: разливаем по правилам из web/rentalsStore");
  const paymentRows: Array<typeof payments.$inferInsert> = [];
  for (const r of RENTALS as Rental[]) {
    const paidStatuses: RentalStatus[] = [
      "active",
      "completed",
      "returning",
      "overdue",
      "completed_damage",
    ];
    if (r.sum > 0 && paidStatuses.includes(r.status as RentalStatus)) {
      paymentRows.push({
        rentalId: r.id,
        type: "rent" as PaymentType,
        amount: r.sum,
        method: r.paymentMethod as PaymentMethod,
        paid: true,
        paidAt: parseDateTime(r.start, r.startTime),
        note: "оплата аренды",
      });
      paymentRows.push({
        rentalId: r.id,
        type: "deposit" as PaymentType,
        amount: r.deposit || 2000,
        method: r.paymentMethod as PaymentMethod,
        paid: true,
        paidAt: parseDateTime(r.start, r.startTime),
        note: "залог",
      });
    }
    if (r.status === "overdue") {
      paymentRows.push({
        rentalId: r.id,
        type: "fine" as PaymentType,
        amount: 200,
        method: "cash" as PaymentMethod,
        paid: false,
        scheduledOn: parseDate(r.endPlanned),
        note: "штраф за просрочку (200 ₽/день)",
      });
    }
    if (r.status === "completed_damage") {
      paymentRows.push({
        rentalId: r.id,
        type: "damage" as PaymentType,
        amount: 3200,
        method: "cash" as PaymentMethod,
        paid: false,
        scheduledOn: parseDate(r.endActual || r.endPlanned),
        note: "ущерб по возврату не погашен",
      });
    }
    if (r.status === "completed" && r.depositReturned) {
      paymentRows.push({
        rentalId: r.id,
        type: "refund" as PaymentType,
        amount: r.deposit || 2000,
        method: r.paymentMethod as PaymentMethod,
        paid: true,
        paidAt: parseDateTime(r.endActual || r.endPlanned, r.startTime),
        note: "возврат залога",
      });
    }
  }
  if (paymentRows.length > 0) {
    await db.insert(payments).values(paymentRows);
  }
  console.log(`  ${paymentRows.length} платежей`);

  /* ----- инциденты (seed из rentalsStore.seedIncidents) ----- */
  console.log("▶ rental_incidents: 3 записи");
  const incidentSeed: Array<{
    rentalId: number;
    type: string;
    date: string;
    damage: number;
    note?: string;
  }> = [
    {
      rentalId: 150,
      type: "Просрочка возврата",
      date: "23.04.2026",
      damage: 3200,
      note: "штраф за 3 дня просрочки",
    },
    {
      rentalId: 160,
      type: "Невозврат скутера",
      date: "15.04.2026",
      damage: 45000,
      note: "скутер не возвращён, заявление в ОВД",
    },
    {
      rentalId: 160,
      type: "ДТП",
      date: "13.04.2026",
      damage: 18000,
      note: "повредил передний фонарь и крыло",
    },
  ];
  await db.insert(rentalIncidents).values(
    incidentSeed.map((i) => {
      const r = (RENTALS as Rental[]).find((x) => x.id === i.rentalId);
      return {
        rentalId: i.rentalId,
        scooterId: r ? (scooterByName.get(r.scooter) ?? null) : null,
        type: i.type,
        occurredOn: parseDate(i.date),
        damage: i.damage,
        paidTowardDamage: 0,
        note: i.note,
      };
    }),
  );

  /* ----- задачи ----- */
  console.log("▶ rental_tasks: 7 записей");
  const taskSeed: Array<{ rentalId: number; title: string; due: string }> = [
    { rentalId: 121, title: "Встретить клиента и принять Gear #18", due: "13.10.2026 14:00" },
    { rentalId: 140, title: "Осмотр Gear #01 по возврату", due: "13.10.2026 14:00" },
    { rentalId: 180, title: "Встреча с Щербаковым Глебом, привезёт паспорт", due: "14.10.2026 11:00" },
    { rentalId: 181, title: "Встреча с Лаврентьевым И., Gear #17", due: "14.10.2026 16:30" },
    { rentalId: 130, title: "Позвонить Волковой А. по просрочке Jog #04", due: "13.10.2026" },
    { rentalId: 131, title: "Звонок по Gear #06 (Рубцов)", due: "13.10.2026" },
    { rentalId: 150, title: "Передать юристу — ущерб Кузнецов С.", due: "15.10.2026" },
  ];
  await db.insert(rentalTasks).values(
    taskSeed.map((t) => ({
      rentalId: t.rentalId,
      title: t.title,
      dueAt: parseTaskDue(t.due),
      done: false,
    })),
  );

  /* ----- После explicit-ID инсертов надо «подкрутить» bigserial-секвенции ----- */
  console.log("▶ Синхронизируем sequence'ы bigserial");
  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('clients','id'),  (SELECT COALESCE(MAX(id), 0) FROM clients))`,
  );
  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('scooters','id'), (SELECT COALESCE(MAX(id), 0) FROM scooters))`,
  );
  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('rentals','id'),  (SELECT COALESCE(MAX(id), 0) FROM rentals))`,
  );

  console.log("✓ Seed завершён");
  await closeDb();
}

main().catch(async (e) => {
  console.error("✗ Ошибка seed:", e);
  await closeDb().catch(() => {});
  process.exit(1);
});
