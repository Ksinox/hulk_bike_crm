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
  jsonb,
  numeric,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ============================================================
 * ENUMS — отражают доменные статусы из TS-типов
 * ============================================================ */

export const userRoleEnum = pgEnum("user_role", [
  "creator", // Разработчик/владелец системы. Скрыт из списка тайлов,
  //            может импёрсонить любую другую роль без пароля.
  "director", // Владелец бизнеса. Все бизнес-права включая ROI и управление сотрудниками.
  "admin", // Администратор. Операционка без финансов.
  "mechanic", // Механик. Только скутеры — пробег, замены масла, ремонты. (в разработке)
  "accountant", // Бухгалтер. Платежи, отчёты. (в разработке)
]);

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
  "disassembly", // «В разборке» — на запчасти, из оборота выведен, но учитывается
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
  // v0.2.75: «Проблемная» — клиент не согласен с актом о повреждениях,
  // отправлена досудебная претензия. Аренда не продолжается.
  "problem",
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
  /** Доплата за замену скутера на другую модель — разница тарифов
   *  × оставшиеся дни. Создаётся автоматически при /swap-scooter
   *  если ставка нового скутера выше. */
  "swap_fee",
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

export const clientApplicationStatusEnum = pgEnum("client_application_status", [
  "draft", // клиент начал заполнять, ещё не нажал «Отправить»
  "new", // отправлено, ждёт менеджера; виджет на дашборде «пульсирует»
  "viewed", // менеджер открыл — пульсация спадает, заявка ещё в списке
  "cancelled", // менеджер пометил как фейк/спам
]);

export const clientApplicationFileKindEnum = pgEnum(
  "client_application_file_kind",
  [
    "passport_main", // главный разворот паспорта (фото с лицом)
    "passport_reg", // разворот с пропиской
    "license", // фото водительского удостоверения
    "selfie", // селфи с паспортом в руке
  ],
);

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
  /** Цвет тайла на экране входа: blue / purple / green / orange / pink */
  avatarColor: text("avatar_color").notNull().default("blue"),
  /**
   * true → при ближайшем входе юзер обязан поменять пароль, до смены
   * фронт показывает блокирующую модалку и не пускает в CRM.
   * Ставим при создании / при сбросе пароля creator'ом/director'ом.
   */
  mustChangePassword: boolean("must_change_password")
    .notNull()
    .default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
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
    /**
     * Произвольный источник, если ни один из enum-вариантов не подходит.
     * Когда заполнено — UI показывает эту строку вместо лейбла enum.
     * source при этом ставится в 'other'.
     */
    sourceCustom: text("source_custom"),

    /**
     * Иностранный гражданин — у него «свободная форма» паспортных данных,
     * потому что у него нет привычной нам серии/номера/кода подразделения.
     * Вся информация в `passportRaw` (произвольный текст). Структурные
     * поля выше при этом могут быть пустыми.
     */
    isForeigner: boolean("is_foreigner").notNull().default(false),
    passportRaw: text("passport_raw"),
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
    /** Модель как enum — legacy, оставлено для совместимости. */
    model: scooterModelEnum("model").notNull(),
    /**
     * Новый FK на каталог моделей (scooter_models). Источник тарифов и
     * аватарки. Nullable на время миграции данных — новые скутеры
     * создаются только через modelId, старые досовместимы через enum.
     */
    modelId: bigint("model_id", { mode: "number" }),
    vin: text("vin").unique(),
    engineNo: text("engine_no"),
    /** Номер рамы/шасси — в договоре идёт отдельной строкой от VIN */
    frameNumber: text("frame_number"),
    /** Год выпуска — для договора проката */
    year: integer("year"),
    /** Цвет — для договора */
    color: text("color"),
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
    /**
     * Перемещён в архив (soft-delete). В обычных списках не отображается,
     * но история аренд сохраняется. Можно восстановить или удалить навсегда.
     */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: text("archived_by"),
    /**
     * Помечен к окончательному удалению — через 7 дней будет физически удалён
     * фоновой задачей (и вместе с ним документы). До истечения срока можно
     * отменить (set deleted_at = null, archived_at = now()).
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    modelIdx: index("scooters_model_idx").on(t.model),
    modelFkIdx: index("scooters_model_id_idx").on(t.modelId),
    baseStatusIdx: index("scooters_base_status_idx").on(t.baseStatus),
    archivedIdx: index("scooters_archived_idx").on(t.archivedAt),
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
    /**
     * Сумма залога в ₽. 0 если залог неденежный — тогда в depositItem
     * хранится описание предмета (например «паспорт», «iPhone»).
     */
    deposit: integer("deposit").notNull().default(2000),
    /** Описание предмета, если залог неденежный. null → залог деньгами. */
    depositItem: text("deposit_item"),
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

    /** Legacy: массив названий. Оставлен для совместимости. */
    equipment: text("equipment").array().notNull().default([]),
    /**
     * Новый формат: массив объектов { itemId?, name, price, free }.
     * itemId — ссылка на equipment_items.id (если выбран из каталога),
     * name и price — снимок на момент аренды (если каталог изменят позже).
     * free=true → цена в итоговую сумму не входит.
     */
    equipmentJson: jsonb("equipment_json").notNull().default([]),
    /** Чеклист подтверждения выдачи — заполняется кнопкой «Подтвердить» */
    confirmContractSigned: boolean("confirm_contract_signed")
      .notNull()
      .default(false),
    confirmRentPaid: boolean("confirm_rent_paid").notNull().default(false),
    confirmDepositReceived: boolean("confirm_deposit_received")
      .notNull()
      .default(false),

    /** Сумма ущерба, выставлена вручную (ДТП, поломка). null — ущерба нет. */
    damageAmount: integer("damage_amount"),

    note: text("note"),

    /**
     * Архив (soft-delete). Удалённая аренда уходит сюда — не показывается
     * в основных списках, но историю клиента и платежи не теряем. Может
     * быть восстановлена директором.
     */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: text("archived_by"),

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
    /**
     * Кто принял деньги (для отчётности и судебных выписок).
     * Заполняется автоматически = текущий пользователь при создании платежа.
     */
    receivedByUserId: bigint("received_by_user_id", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    /**
     * Привязка платежа к конкретному акту о повреждениях (для type=damage).
     * Чтобы по акту считать остаток долга = total - depositCovered - sum(payments).
     */
    damageReportId: bigint("damage_report_id", { mode: "number" }),
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

/* ============================================================
 * scooter_models — каталог моделей скутеров
 *
 * Вручную заполняет владелец: название, аватарка, тарифы, быстрый выбор.
 * Тарифы подтягиваются в аренду в зависимости от выбранного скутера.
 * ============================================================ */

export const scooterModels = pgTable(
  "scooter_models",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull().unique(),
    /** Ключ оригинального файла аватарки в MinIO + имя файла. */
    avatarKey: text("avatar_key"),
    avatarFileName: text("avatar_file_name"),
    /** Ключ кропнутой миниатюры (≤512px JPEG) — используется в плитках/списках,
     *  чтобы не дёргать оригинал при каждом рендере. */
    avatarThumbKey: text("avatar_thumb_key"),
    avatarThumbFileName: text("avatar_thumb_file_name"),
    /**
     * true → показывается в быстром пикере при создании аренды.
     * Обычно 4 самых частых моделей отмечены true, остальное ищется
     * через строку поиска.
     */
    quickPick: boolean("quick_pick").notNull().default(false),
    /**
     * Активна ли модель в системе. false → модель не показывается
     * на лендинге и в выборах CRM (выбор скутера в форме новой аренды,
     * фильтры и т.п.). Используется когда модель временно «выведена
     * из обращения», но удалять её нельзя — за ней есть история.
     */
    active: boolean("active").notNull().default(true),
    /** Ставки ₽/сут по периодам аренды */
    dayRate: integer("day_rate").notNull().default(1300), // 1–2 дня
    shortRate: integer("short_rate").notNull().default(700), // 3–6 дней
    weekRate: integer("week_rate").notNull().default(500), // 7–29 дней
    monthRate: integer("month_rate").notNull().default(400), // 30+ дней
    /** Технические характеристики — показываются на лендинге.
     * Все необязательные: модель без них на лендинг попадёт всё равно
     * (фильтр там только по наличию аватарки), но без бейджей. */
    maxSpeedKmh: integer("max_speed_kmh"),
    tankVolumeL: numeric("tank_volume_l", { precision: 4, scale: 1 }),
    /** Расход топлива, л на 100 км (например 1.50). */
    fuelLPer100Km: numeric("fuel_l_per_100km", { precision: 4, scale: 2 }),
    /** 'air' (воздушное) | 'liquid' (жидкостное) */
    coolingType: text("cooling_type"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    quickPickIdx: index("scooter_models_quick_pick_idx").on(t.quickPick),
  }),
);

/* ============================================================
 * equipment_items — каталог экипировки (шлем, замок, цепь, багажник, …)
 *
 * Каждая позиция имеет цену и флаг «бесплатно». Если free=true — цена
 * в итог аренды не добавляется. При создании модели аренды из каталога
 * берётся снимок (цена замораживается в equipmentJson аренды).
 * ============================================================ */

export const equipmentItems = pgTable(
  "equipment_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull().unique(),
    avatarKey: text("avatar_key"),
    avatarFileName: text("avatar_file_name"),
    avatarThumbKey: text("avatar_thumb_key"),
    avatarThumbFileName: text("avatar_thumb_file_name"),
    quickPick: boolean("quick_pick").notNull().default(true),
    /** Цена за всю аренду (не за сутки) */
    price: integer("price").notNull().default(0),
    /** true → бесплатно, цена игнорируется при расчёте суммы аренды */
    isFree: boolean("is_free").notNull().default(true),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

/* ============================================================
 * scooter_maintenance — журнал обслуживания скутеров
 *
 * Реальные расходы по конкретному скутеру: замена масла, ремонт,
 * покупка запчастей. Агрегируется в карточке скутера.
 * ============================================================ */

export const scooterMaintenance = pgTable(
  "scooter_maintenance",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    scooterId: bigint("scooter_id", { mode: "number" })
      .notNull()
      .references(() => scooters.id, { onDelete: "cascade" }),
    /** Тип работы: oil (замена масла) / repair (ремонт) / parts (запчасти) / other */
    kind: text("kind").notNull().default("other"),
    /** Дата работы */
    performedOn: date("performed_on").notNull(),
    /** Сумма расходов в ₽ */
    amount: integer("amount").notNull().default(0),
    /** Пробег на момент работы, км — опционально (важно для ТО) */
    mileage: integer("mileage"),
    note: text("note"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    scooterIdx: index("scooter_maintenance_scooter_idx").on(t.scooterId),
    dateIdx: index("scooter_maintenance_date_idx").on(t.performedOn),
  }),
);

/* ============================================================
 * activity_log — журнал действий пользователей
 *
 * Логируем создание/редактирование/удаление ключевых сущностей
 * (клиенты, скутеры, аренды, платежи, сотрудники). Показывается в
 * ленте «Последние действия» на дашборде для всех активных ролей.
 * ============================================================ */

export const activityLog = pgTable(
  "activity_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** Кто сделал. Nullable если действие системное (seed, миграции). */
    userId: bigint("user_id", { mode: "number" }),
    userName: text("user_name").notNull().default("система"),
    userRole: text("user_role"),
    /** Категория — для группировки в UI */
    entity: text("entity").notNull(), // 'client' | 'scooter' | 'rental' | 'payment' | 'user' | 'model' | 'equipment' | 'maintenance'
    entityId: bigint("entity_id", { mode: "number" }),
    /** Глагол действия — 'created' / 'updated' / 'deleted' / 'archived' / 'restored' / 'confirmed_payment' / … */
    action: text("action").notNull(),
    /** Человекочитаемое описание, уже собранное на бэке */
    summary: text("summary").notNull(),
    /** Доп данные в свободной форме (diff, доп. контекст) */
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    createdIdx: index("activity_log_created_idx").on(t.createdAt),
    entityIdx: index("activity_log_entity_idx").on(t.entity, t.entityId),
    userIdx: index("activity_log_user_idx").on(t.userId),
  }),
);

/* ============================================================
 * scooter_swaps — история замен скутера в рамках одной аренды.
 *
 * Замена скутера — это in-place операция (rental.scooterId меняется),
 * связка не плодится. Все факты замен пишутся сюда: кто на кого
 * заменён, причина, плата за замену модели если другая (или 0).
 * Документ «Акт приёма-передачи и замены скутера» формируется по
 * последней записи; в журнале действий аренды видно всю историю.
 * ============================================================ */
export const scooterSwaps = pgTable(
  "scooter_swaps",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    rentalId: bigint("rental_id", { mode: "number" })
      .notNull()
      .references(() => rentals.id, { onDelete: "cascade" }),
    /** Скутер до замены. null если запись о первоначальной выдаче пропущена. */
    prevScooterId: bigint("prev_scooter_id", { mode: "number" }).references(
      () => scooters.id,
      { onDelete: "set null" },
    ),
    newScooterId: bigint("new_scooter_id", { mode: "number" })
      .notNull()
      .references(() => scooters.id, { onDelete: "set null" }),
    swapAt: timestamp("swap_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reason: text("reason"),
    /**
     * Доплата за замену модели, ₽. Если новая модель дороже старой —
     * = (новая ставка − старая) × оставшиеся дни. Иначе 0.
     * Платёж с типом 'swap_fee' создаётся отдельно в payments.
     */
    feeAmount: integer("fee_amount").notNull().default(0),
    createdByUserId: bigint("created_by_user_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    rentalIdx: index("scooter_swaps_rental_idx").on(t.rentalId),
    swapAtIdx: index("scooter_swaps_swap_at_idx").on(t.swapAt),
  }),
);

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

/* ============================================================
 * Прейскурант — справочник цен на запчасти / штрафы / экипировку.
 * Используется при фиксации ущерба (мультивыбор → автосумма).
 * Структура: группы (Детали / Штрафы / Повреждения / Экипировка)
 * + позиции с одной или двумя ценами (для Деталей: Gear / Jog).
 * ============================================================ */

export const priceGroups = pgTable(
  "price_groups",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    /**
     * Привязка группы к конкретной модели скутера. NULL = группа общая
     * (Штрафы, Экипировка, Повреждения — применимы ко всем).
     * Используется при фиксации ущерба для авто-фильтра позиций по модели аренды.
     */
    scooterModelId: bigint("scooter_model_id", { mode: "number" }).references(
      () => scooterModels.id,
      { onDelete: "set null" },
    ),
    /**
     * Legacy: true → у позиций две колонки цен (Gear / Jog).
     * В новых группах не используем — переходим на одна группа = одна модель.
     */
    hasTwoPrices: boolean("has_two_prices").notNull().default(false),
    priceALabel: text("price_a_label").notNull().default("Цена"),
    priceBLabel: text("price_b_label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    modelIdx: index("price_groups_model_idx").on(t.scooterModelId),
  }),
);

export const priceItems = pgTable(
  "price_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    groupId: bigint("group_id", { mode: "number" })
      .notNull()
      .references(() => priceGroups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Цена в ₽. Nullable если для конкретной модели позиция не применяется. */
    priceA: integer("price_a"),
    priceB: integer("price_b"),
    sortOrder: integer("sort_order").notNull().default(0),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    groupIdx: index("price_items_group_idx").on(t.groupId),
  }),
);

export const priceGroupsRelations = relations(priceGroups, ({ many }) => ({
  items: many(priceItems),
}));

export const priceItemsRelations = relations(priceItems, ({ one }) => ({
  group: one(priceGroups, {
    fields: [priceItems.groupId],
    references: [priceGroups.id],
  }),
}));

/* ============================================================
 * damage_reports — акт о повреждениях по аренде.
 * Создаётся при фиксации ущерба. Иммутабельный snapshot цен:
 * если позже прейскурант меняется — старый акт остаётся как был.
 *
 * Долг по акту = total - depositCovered - sum(payments[type=damage]).
 * Когда долг = 0, аренду можно архивировать.
 * ============================================================ */
export const damageReports = pgTable(
  "damage_reports",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    rentalId: bigint("rental_id", { mode: "number" })
      .notNull()
      .references(() => rentals.id, { onDelete: "cascade" }),
    createdByUserId: bigint("created_by_user_id", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    /** Итоговая сумма по всем позициям с учётом скидок и количества. */
    total: integer("total").notNull().default(0),
    /** Сколько зачли из залога клиента. От 0 до min(total, deposit). */
    depositCovered: integer("deposit_covered").notNull().default(0),
    /** Произвольный комментарий к акту (например, обстоятельства). */
    note: text("note"),
    /**
     * Реакция клиента на акт после печати. v0.2.75.
     *  - 'pending' — акт создан, реакции ещё нет.
     *  - 'agreed' — клиент согласен платить, аренда продолжается.
     *  - 'disputed' — клиент не согласен, печатается претензия,
     *    аренда переводится в статус 'problem'.
     */
    clientAgreement: text("client_agreement").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    rentalIdx: index("damage_reports_rental_idx").on(t.rentalId),
  }),
);

export const damageReportItems = pgTable(
  "damage_report_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    reportId: bigint("report_id", { mode: "number" })
      .notNull()
      .references(() => damageReports.id, { onDelete: "cascade" }),
    /** Источник из прейскуранта (nullable — если позицию позже удалили). */
    priceItemId: bigint("price_item_id", { mode: "number" }).references(
      () => priceItems.id,
      { onDelete: "set null" },
    ),
    /** Snapshot имени позиции на момент создания акта. */
    name: text("name").notNull(),
    /** Цена из прейскуранта на момент создания акта. */
    originalPrice: integer("original_price").notNull(),
    /** Фактическая цена за единицу (после скидки). */
    finalPrice: integer("final_price").notNull(),
    quantity: integer("quantity").notNull().default(1),
    comment: text("comment"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    reportIdx: index("damage_report_items_report_idx").on(t.reportId),
  }),
);

export const damageReportsRelations = relations(damageReports, ({ many, one }) => ({
  items: many(damageReportItems),
  rental: one(rentals, {
    fields: [damageReports.rentalId],
    references: [rentals.id],
  }),
}));

export const damageReportItemsRelations = relations(damageReportItems, ({ one }) => ({
  report: one(damageReports, {
    fields: [damageReportItems.reportId],
    references: [damageReports.id],
  }),
}));

/* ============================================================
 * repair_jobs / repair_progress / repair_progress_photos
 *
 * Журнал ремонта скутера: цикл «ушёл в repair → готов к аренде».
 * Создаётся автоматически при создании damage_report с
 * sendScooterToRepair=true. Каждый damage_report_item становится
 * пунктом чек-листа (repair_progress) с возможностью прикрепить
 * фото повреждения / результата работ.
 * ============================================================ */

export const repairJobs = pgTable(
  "repair_jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    scooterId: bigint("scooter_id", { mode: "number" })
      .notNull()
      .references(() => scooters.id, { onDelete: "cascade" }),
    rentalId: bigint("rental_id", { mode: "number" }).references(
      () => rentals.id,
      { onDelete: "set null" },
    ),
    damageReportId: bigint("damage_report_id", { mode: "number" }).references(
      () => damageReports.id,
      { onDelete: "set null" },
    ),
    /** 'in_progress' | 'completed' */
    status: text("status").notNull().default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdByUserId: bigint("created_by_user_id", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    completedByUserId: bigint("completed_by_user_id", {
      mode: "number",
    }).references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    scooterIdx: index("repair_jobs_scooter_idx").on(t.scooterId),
    statusIdx: index("repair_jobs_status_idx").on(t.status),
  }),
);

export const repairProgress = pgTable(
  "repair_progress",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    repairJobId: bigint("repair_job_id", { mode: "number" })
      .notNull()
      .references(() => repairJobs.id, { onDelete: "cascade" }),
    /** Снимок ссылается на позицию акта ущерба (если nullable — пункт
     *  добавлен вручную или акт удалён). */
    damageReportItemId: bigint("damage_report_item_id", {
      mode: "number",
    }).references(() => damageReportItems.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    qty: integer("qty").notNull().default(1),
    /** Цена позиции на момент создания пункта (для отображения, не для биллинга). */
    priceSnapshot: integer("price_snapshot").notNull().default(0),
    done: boolean("done").notNull().default(false),
    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedByUserId: bigint("completed_by_user_id", {
      mode: "number",
    }).references(() => users.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    jobIdx: index("repair_progress_job_idx").on(t.repairJobId),
  }),
);

export const repairProgressPhotos = pgTable(
  "repair_progress_photos",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    progressId: bigint("progress_id", { mode: "number" })
      .notNull()
      .references(() => repairProgress.id, { onDelete: "cascade" }),
    fileKey: text("file_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull().default(0),
    uploadedByUserId: bigint("uploaded_by_user_id", {
      mode: "number",
    }).references(() => users.id, { onDelete: "set null" }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    progressIdx: index("repair_progress_photos_progress_idx").on(t.progressId),
  }),
);

export const repairJobsRelations = relations(repairJobs, ({ many, one }) => ({
  progress: many(repairProgress),
  scooter: one(scooters, {
    fields: [repairJobs.scooterId],
    references: [scooters.id],
  }),
  rental: one(rentals, {
    fields: [repairJobs.rentalId],
    references: [rentals.id],
  }),
  damageReport: one(damageReports, {
    fields: [repairJobs.damageReportId],
    references: [damageReports.id],
  }),
}));

export const repairProgressRelations = relations(
  repairProgress,
  ({ one, many }) => ({
    job: one(repairJobs, {
      fields: [repairProgress.repairJobId],
      references: [repairJobs.id],
    }),
    photos: many(repairProgressPhotos),
  }),
);

export const repairProgressPhotosRelations = relations(
  repairProgressPhotos,
  ({ one }) => ({
    progress: one(repairProgress, {
      fields: [repairProgressPhotos.progressId],
      references: [repairProgress.id],
    }),
  }),
);

/* ============================================================
 * client_applications — публичные заявки клиентов (как Google Forms).
 *
 * Постоянная ссылка вида https://crm.hulk-bike.ru/apply открывает
 * форму без авторизации. Каждый заход = новая заявка.
 * Поля зеркалят `clients`, кроме менеджерских (source, blacklist*, license*).
 * Менеджер при «Оформить» создаёт клиента и переносит файлы.
 * ============================================================ */

export const clientApplications = pgTable(
  "client_applications",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    status: clientApplicationStatusEnum("status").notNull().default("draft"),

    // Поля как в clients (всё nullable — черновик может быть неполным)
    name: text("name"),
    phone: text("phone"),
    extraPhone: text("extra_phone"),
    isForeigner: boolean("is_foreigner").notNull().default(false),
    passportRaw: text("passport_raw"),
    birthDate: date("birth_date"),
    passportSeries: text("passport_series"),
    passportNumber: text("passport_number"),
    passportIssuedOn: date("passport_issued_on"),
    passportIssuer: text("passport_issuer"),
    passportDivisionCode: text("passport_division_code"),
    passportRegistration: text("passport_registration"),
    /** Адрес проживания (если отличается от регистрации). При convert
     *  если != passportRegistration, складываем в clients.comment. */
    liveAddress: text("live_address"),
    /** Если true, liveAddress = passportRegistration (поле скрыто в UI). */
    sameAddress: boolean("same_address").notNull().default(true),

    // Аудит / токен
    /** Короткий random для PATCH/file-операций до submit. После submit — null. */
    uploadToken: text("upload_token"),
    uploadTokenExpiresAt: timestamp("upload_token_expires_at", {
      withTimezone: true,
    }),
    /** Когда менеджер впервые открыл (mark-viewed) — для подсветки. */
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    /** Когда клиент нажал Submit. До этого row — draft. */
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    /** Honeypot: должно быть пустым. Если есть значение — спам, в БД не пишем. */
    honeypot: text("honeypot"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    statusIdx: index("client_applications_status_idx").on(t.status),
    createdIdx: index("client_applications_created_idx").on(t.createdAt),
    tokenIdx: index("client_applications_token_idx").on(t.uploadToken),
  }),
);

export const clientApplicationFiles = pgTable(
  "client_application_files",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    applicationId: bigint("application_id", { mode: "number" })
      .notNull()
      .references(() => clientApplications.id, { onDelete: "cascade" }),
    kind: clientApplicationFileKindEnum("kind").notNull(),
    fileKey: text("file_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    applicationIdx: index("client_application_files_application_idx").on(
      t.applicationId,
    ),
    /** Один активный файл каждого kind на заявку (перезагрузка через DELETE+POST) */
    appKindUnique: uniqueIndex("client_application_files_app_kind_uq").on(
      t.applicationId,
      t.kind,
    ),
  }),
);

export const clientApplicationsRelations = relations(
  clientApplications,
  ({ many }) => ({
    files: many(clientApplicationFiles),
  }),
);

export const clientApplicationFilesRelations = relations(
  clientApplicationFiles,
  ({ one }) => ({
    application: one(clientApplications, {
      fields: [clientApplicationFiles.applicationId],
      references: [clientApplications.id],
    }),
  }),
);

/* ============================================================
 * document_templates — пользовательские шаблоны документов.
 *
 * Системные шаблоны (договор, акт возврата, акт повреждений, выписка)
 * хардкодятся в render.ts. Эта таблица — для пользовательских правок:
 *  - kind='override' — оверрайд для системного templateKey (contract_full,
 *    act_return, damage, statement). При рендере если есть override —
 *    используется он, иначе системный.
 *  - kind='custom'   — самостоятельный пользовательский шаблон, не
 *    привязан к существующему типу. templateKey уникальный.
 *
 * body — HTML строка с <span data-var="path.to.value">{{var}}</span>
 * пилюлями переменных. При рендере подставляются реальные значения.
 * ============================================================ */
export const documentTemplates = pgTable(
  "document_templates",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    templateKey: text("template_key").notNull(),
    /** override (для системного шаблона) | custom (новый пользовательский) */
    kind: text("kind").notNull().default("override"),
    name: text("name").notNull(),
    /** HTML с пилюлями <span data-var="..."> для переменных */
    body: text("body").notNull(),
    createdByUserId: bigint("created_by_user_id", {
      mode: "number",
    }).references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    keyIdx: index("document_templates_key_idx").on(t.templateKey),
  }),
);

/* ============================================================
 * debt_entries — лента событий по долгу аренды (v0.3.8).
 *
 * Источники долга в системе три:
 *  1) «просрочка» — derived: 1.5 × rate × overdueDays на момент now()
 *  2) «ущерб»     — damage_reports.debt (живёт в своих таблицах)
 *  3) «ручной»    — этот журнал (manual_charge / manual_forgive)
 *
 * Здесь же фиксируются «сбросы просрочки» — списания (overdue_forgive),
 * чтобы можно было восстановить историю кто/когда/сколько простил.
 * ============================================================ */
export const debtEntries = pgTable(
  "debt_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    rentalId: bigint("rental_id", { mode: "number" })
      .notNull()
      .references(() => rentals.id, { onDelete: "cascade" }),
    /**
     * - manual_charge   — оператор начислил долг (+amount)
     * - manual_forgive  — оператор списал часть ручного долга (-amount)
     * - overdue_forgive — оператор сбросил просрочку (списал computed-долг)
     * - overdue_payment — оплата просрочки (зарезервировано под §18)
     */
    kind: text("kind").notNull(),
    /** Сумма всегда положительная; знак подразумевается видом события. */
    amount: integer("amount").notNull(),
    comment: text("comment"),
    createdByUserId: bigint("created_by_user_id", {
      mode: "number",
    }).references(() => users.id, { onDelete: "set null" }),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    rentalIdx: index("debt_entries_rental_idx").on(t.rentalId),
    kindIdx: index("debt_entries_kind_idx").on(t.kind),
  }),
);
