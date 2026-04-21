/**
 * Схема БД Халк Байк CRM.
 *
 * Источник истины по бизнес-модели: папка Скутеры_CRM_Бизнес/ +
 * существующие TypeScript-типы в apps/web/src/lib/mock/* и *Store.ts.
 *
 * Договорённости:
 * — деньги хранятся как int в рублях (копейки не нужны — шкала бизнеса мелкая,
 *   все расчёты в целых ₽). При необходимости позже перейдём на numeric(12,2).
 * — временные метки — timestamptz (UTC), даты без времени — date.
 * — id — bigserial. Для ссылок — bigint references.
 * — soft-delete не вводим, history будет через отдельные audit-таблицы (позже).
 */

import {
  pgEnum,
  pgTable,
  bigserial,
  bigint,
  text,
  integer,
  boolean,
  date,
  timestamp,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ============================================================
 * ENUMS — отражают доменные статусы из TS-типов
 * ============================================================ */

export const userRoleEnum = pgEnum("user_role", ["director", "admin"]);

export const clientSourceEnum = pgEnum("client_source", [
  "avito",
  "repeat",
  "ref",
  "maps",
  "other",
]);

export const scooterModelEnum = pgEnum("scooter_model", [
  "jog",
  "gear",
  "honda",
  "tank",
]);

export const scooterBaseStatusEnum = pgEnum("scooter_base_status", [
  "ready", // «Не распределён» — только что заведён, админ ещё не решил что с ним
  "rental_pool", // «Парк аренды» — выделен под аренду, доступен к сдаче
  "repair", // на ремонте
  "buyout", // передан клиенту в рассрочку (выкуп)
  "for_sale", // выставлен на продажу
  "sold", // продан, в обороте не участвует
]);

export const rentalStatusEnum = pgEnum("rental_status", [
  "new_request",
  "meeting",
  "active",
  "overdue",
  "returning",
  "completed",
  "completed_damage",
  "cancelled",
  "police",
  "court",
]);

export const rentalSourceChannelEnum = pgEnum("rental_source_channel", [
  "avito",
  "repeat",
  "ref",
  "passing",
  "other",
]);

export const tariffPeriodEnum = pgEnum("tariff_period", [
  "short", // 3–6 дней
  "week", // 7–29 дней
  "month", // 30+ дней
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "card",
  "transfer",
]);

export const paymentTypeEnum = pgEnum("payment_type", [
  "rent",
  "deposit",
  "fine",
  "damage",
  "refund",
]);

export const paymentConfirmerRoleEnum = pgEnum("payment_confirmer_role", [
  "boss",
  "manager",
]);

export const clientDocKindEnum = pgEnum("client_doc_kind", [
  "photo", // основная аватарка клиента
  "passport", // паспорт
  "license", // водительские права
  "extra", // прочее (селфи, доп. документы, скриншоты переписок)
]);

export const scooterDocKindEnum = pgEnum("scooter_doc_kind", [
  "pts", // паспорт транспортного средства
  "sts", // свидетельство о регистрации
  "osago", // полис ОСАГО
  "purchase", // договор покупки (только директору)
  "photo", // фотография скутера (дополнительно к аватарке, до 10 штук)
]);

/* ============================================================
 * users — сотрудники (director / admin)
 * На MVP: хранит учётки для входа в CRM.
 * ============================================================ */

export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  login: text("login").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("admin"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ============================================================
 * clients — клиенты (арендаторы)
 *
 * Паспортные/водительские данные ФЛАТТЕНИМ сюда nullable-полями
 * (не все клиенты имеют заполненную анкету — новая заявка,
 * проходящий спросил «сколько стоит»).
 * Если анкета разрастётся — вынесем в client_details 1:1.
 * ============================================================ */

export const clients = pgTable(
  "clients",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    extraPhone: text("extra_phone"),
    rating: integer("rating").notNull().default(80), // 0..100, стартовое 80
    source: clientSourceEnum("source").notNull().default("other"),
    addedOn: date("added_on").notNull().defaultNow(),
    comment: text("comment"),

    // Флаги
    blacklisted: boolean("blacklisted").notNull().default(false),
    blacklistReason: text("blacklist_reason"),
    blacklistAt: date("blacklist_at"),
    blacklistBy: text("blacklist_by"),
    /** «Не выходит на связь» — двусторонняя метка client↔rentals */
    unreachable: boolean("unreachable").notNull().default(false),

    // Паспорт
    birthDate: date("birth_date"),
    passportSeries: text("passport_series"),
    passportNumber: text("passport_number"),
    passportIssuedOn: date("passport_issued_on"),
    passportIssuer: text("passport_issuer"),
    passportDivisionCode: text("passport_division_code"),
    passportRegistration: text("passport_registration"),

    // Права
    licenseNumber: text("license_number"),
    licenseCategories: text("license_categories"),
    licenseIssuedOn: date("license_issued_on"),
    licenseExpiresOn: date("license_expires_on"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    phoneIdx: index("clients_phone_idx").on(t.phone),
    nameIdx: index("clients_name_idx").on(t.name),
    blacklistedIdx: index("clients_blacklisted_idx").on(t.blacklisted),
    unreachableIdx: index("clients_unreachable_idx").on(t.unreachable),
  }),
);

/* ============================================================
 * client_documents — фото клиента, сканы паспорта и т.п.
 * ============================================================ */

export const clientDocuments = pgTable(
  "client_documents",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    clientId: bigint("client_id", { mode: "number" })
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    kind: clientDocKindEnum("kind").notNull(),
    /** Ключ в объектном хранилище (S3/MinIO) */
    fileKey: text("file_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(), // байт
    title: text("title"), // «Селфи с паспортом», «Скрин переписки»
    comment: text("comment"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    clientIdx: index("client_documents_client_idx").on(t.clientId),
  }),
);

/* ============================================================
 * scooters — парк скутеров
 * ============================================================ */

export const scooters = pgTable(
  "scooters",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** Отображаемое имя: «Jog #07». Уникально в пределах парка. */
    name: text("name").notNull().unique(),
    model: scooterModelEnum("model").notNull(),
    vin: text("vin").unique(),
    engineNo: text("engine_no"),
    mileage: integer("mileage").notNull().default(0),
    baseStatus: scooterBaseStatusEnum("base_status")
      .notNull()
      .default("ready"),
    purchaseDate: date("purchase_date"),
    /** Цена закупа, ₽. Читается только директором на уровне API. */
    purchasePrice: integer("purchase_price"),
    /** Пробег на момент последней замены масла, км */
    lastOilChangeMileage: integer("last_oil_change_mileage"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    modelIdx: index("scooters_model_idx").on(t.model),
    baseStatusIdx: index("scooters_base_status_idx").on(t.baseStatus),
  }),
);

/* ============================================================
 * scooter_documents — ПТС/СТС/ОСАГО/договор покупки
 * ============================================================ */

export const scooterDocuments = pgTable(
  "scooter_documents",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    scooterId: bigint("scooter_id", { mode: "number" })
      .notNull()
      .references(() => scooters.id, { onDelete: "cascade" }),
    kind: scooterDocKindEnum("kind").notNull(),
    fileKey: text("file_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    /** Только для kind='osago' — дата окончания полиса */
    osagoValidUntil: date("osago_valid_until"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    scooterIdx: index("scooter_documents_scooter_idx").on(t.scooterId),
    /** Один «активный» документ каждого «официального» вида на скутер
     *  (pts/sts/osago/purchase — их заменяем через UPDATE).
     *  Для kind='photo' этого ограничения нет — там до 10 фото на скутер. */
    scooterKindUnique: uniqueIndex("scooter_documents_scooter_kind_uq")
      .on(t.scooterId, t.kind)
      .where(sql`kind <> 'photo'`),
  }),
);

/* ============================================================
 * rentals — аренды
 *
 * Продления реализованы через parent_rental_id:
 *   rental[123] --parent--> rental[122] --parent--> rental[121]
 * Финансы и длительность считаются по цепочке.
 * ============================================================ */

export const rentals = pgTable(
  "rentals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    clientId: bigint("client_id", { mode: "number" })
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    scooterId: bigint("scooter_id", { mode: "number" }).references(
      () => scooters.id,
      { onDelete: "set null" },
    ),

    /** Продление → ссылка на предыдущую аренду. null у корневой. */
    parentRentalId: bigint("parent_rental_id", { mode: "number" }),

    status: rentalStatusEnum("status").notNull().default("new_request"),
    sourceChannel: rentalSourceChannelEnum("source_channel"),

    // Тариф и финансы
    tariffPeriod: tariffPeriodEnum("tariff_period").notNull(),
    rate: integer("rate").notNull(), // ₽ / сут
    deposit: integer("deposit").notNull().default(2000),
    depositReturned: boolean("deposit_returned"),

    // Период (timestamptz — время важно: 12:00 по договору)
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endPlannedAt: timestamp("end_planned_at", {
      withTimezone: true,
    }).notNull(),
    endActualAt: timestamp("end_actual_at", { withTimezone: true }),

    // Денормализованные для скорости (пересчитываются на write)
    days: integer("days").notNull(),
    sum: integer("sum").notNull(), // rate * days

    paymentMethod: paymentMethodEnum("payment_method").notNull(),

    // Контроль выдачи
    contractUploaded: boolean("contract_uploaded").notNull().default(false),
    paymentConfirmedBy: paymentConfirmerRoleEnum("payment_confirmed_by"),
    paymentConfirmedByName: text("payment_confirmed_by_name"),
    paymentConfirmedAt: timestamp("payment_confirmed_at", {
      withTimezone: true,
    }),

    equipment: text("equipment").array().notNull().default([]),

    /** Сумма ущерба, выставлена вручную (ДТП, поломка). null — ущерба нет. */
    damageAmount: integer("damage_amount"),

    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    clientIdx: index("rentals_client_idx").on(t.clientId),
    scooterIdx: index("rentals_scooter_idx").on(t.scooterId),
    statusIdx: index("rentals_status_idx").on(t.status),
    parentIdx: index("rentals_parent_idx").on(t.parentRentalId),
    endPlannedIdx: index("rentals_end_planned_idx").on(t.endPlannedAt),
  }),
);

/* ============================================================
 * payments — платежи по аренде
 * ============================================================ */

export const payments = pgTable(
  "payments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    rentalId: bigint("rental_id", { mode: "number" })
      .notNull()
      .references(() => rentals.id, { onDelete: "cascade" }),
    type: paymentTypeEnum("type").notNull(),
    amount: integer("amount").notNull(), // ₽
    method: paymentMethodEnum("method").notNull(),
    /** true — уже получено, false — ожидается (начисление/план) */
    paid: boolean("paid").notNull().default(false),
    /** Дата фактической оплаты (или null, пока не оплачен) */
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** Дата, на которую начислен (для fine/рент-рассрочки) */
    scheduledOn: date("scheduled_on"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    rentalIdx: index("payments_rental_idx").on(t.rentalId),
    paidIdx: index("payments_paid_idx").on(t.paid),
  }),
);

/* ============================================================
 * rental_incidents — инциденты (ДТП, поломки, невозвраты)
 * ============================================================ */

export const rentalIncidents = pgTable(
  "rental_incidents",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    rentalId: bigint("rental_id", { mode: "number" })
      .notNull()
      .references(() => rentals.id, { onDelete: "cascade" }),
    /** Для удобной фильтрации «все инциденты по скутеру» без джойна */
    scooterId: bigint("scooter_id", { mode: "number" }).references(
      () => scooters.id,
      { onDelete: "set null" },
    ),
    type: text("type").notNull(), // ДТП, Поломка, Эвакуация, Кража…
    occurredOn: date("occurred_on").notNull(),
    damage: integer("damage").notNull().default(0), // ₽
    paidTowardDamage: integer("paid_toward_damage").notNull().default(0),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    rentalIdx: index("rental_incidents_rental_idx").on(t.rentalId),
    scooterIdx: index("rental_incidents_scooter_idx").on(t.scooterId),
  }),
);

/* ============================================================
 * rental_tasks — задачи-напоминания (встречи, звонки, осмотры)
 * ============================================================ */

export const rentalTasks = pgTable(
  "rental_tasks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** Привязка к конкретной аренде (чаще всего) */
    rentalId: bigint("rental_id", { mode: "number" }).references(
      () => rentals.id,
      { onDelete: "cascade" },
    ),
    /** Или просто к клиенту (перезвонить, напомнить) */
    clientId: bigint("client_id", { mode: "number" }).references(
      () => clients.id,
      { onDelete: "cascade" },
    ),
    title: text("title").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    dueIdx: index("rental_tasks_due_idx").on(t.dueAt),
    doneIdx: index("rental_tasks_done_idx").on(t.done),
  }),
);

/* ============================================================
 * return_inspections — чек-лист возврата (1 : 1 с арендой)
 * ============================================================ */

export const returnInspections = pgTable(
  "return_inspections",
  {
    rentalId: bigint("rental_id", { mode: "number" })
      .notNull()
      .references(() => rentals.id, { onDelete: "cascade" }),
    inspectedOn: date("inspected_on").notNull(),
    conditionOk: boolean("condition_ok").notNull(),
    equipmentOk: boolean("equipment_ok").notNull(),
    depositReturned: boolean("deposit_returned").notNull(),
    mileageAtReturn: integer("mileage_at_return"),
    damageNotes: text("damage_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.rentalId] }),
  }),
);

/* ============================================================
 * RELATIONS — для Drizzle query API
 * ============================================================ */

export const clientsRelations = relations(clients, ({ many }) => ({
  documents: many(clientDocuments),
  rentals: many(rentals),
  tasks: many(rentalTasks),
}));

export const clientDocumentsRelations = relations(
  clientDocuments,
  ({ one }) => ({
    client: one(clients, {
      fields: [clientDocuments.clientId],
      references: [clients.id],
    }),
  }),
);

export const scootersRelations = relations(scooters, ({ many }) => ({
  documents: many(scooterDocuments),
  rentals: many(rentals),
  incidents: many(rentalIncidents),
}));

export const scooterDocumentsRelations = relations(
  scooterDocuments,
  ({ one }) => ({
    scooter: one(scooters, {
      fields: [scooterDocuments.scooterId],
      references: [scooters.id],
    }),
  }),
);

export const rentalsRelations = relations(rentals, ({ one, many }) => ({
  client: one(clients, {
    fields: [rentals.clientId],
    references: [clients.id],
  }),
  scooter: one(scooters, {
    fields: [rentals.scooterId],
    references: [scooters.id],
  }),
  parent: one(rentals, {
    fields: [rentals.parentRentalId],
    references: [rentals.id],
    relationName: "parentRental",
  }),
  children: many(rentals, { relationName: "parentRental" }),
  payments: many(payments),
  incidents: many(rentalIncidents),
  tasks: many(rentalTasks),
  inspection: one(returnInspections),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  rental: one(rentals, {
    fields: [payments.rentalId],
    references: [rentals.id],
  }),
}));

export const rentalIncidentsRelations = relations(
  rentalIncidents,
  ({ one }) => ({
    rental: one(rentals, {
      fields: [rentalIncidents.rentalId],
      references: [rentals.id],
    }),
    scooter: one(scooters, {
      fields: [rentalIncidents.scooterId],
      references: [scooters.id],
    }),
  }),
);

export const rentalTasksRelations = relations(rentalTasks, ({ one }) => ({
  rental: one(rentals, {
    fields: [rentalTasks.rentalId],
    references: [rentals.id],
  }),
  client: one(clients, {
    fields: [rentalTasks.clientId],
    references: [clients.id],
  }),
}));

export const returnInspectionsRelations = relations(
  returnInspections,
  ({ one }) => ({
    rental: one(rentals, {
      fields: [returnInspections.rentalId],
      references: [rentals.id],
    }),
  }),
);
