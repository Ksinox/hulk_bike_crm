/**
 * Типы ответа API — зеркало Drizzle-схемы apps/api/src/db/schema.ts.
 *
 * Сейчас пишем руками. В будущем можно сгенерировать из БД через openapi или
 * взять Drizzle-инференс из api-пакета (для этого надо вытащить schema.ts в
 * общий пакет, но не срочно).
 */

export type ClientSource = "avito" | "repeat" | "ref" | "maps" | "other";

export type ApiClient = {
  id: number;
  name: string;
  phone: string;
  extraPhone: string | null;
  rating: number;
  source: ClientSource;
  /** Свой источник, если предустановленные варианты не подошли. */
  sourceCustom: string | null;
  /** Иностранный гражданин — паспорт в свободной форме. */
  isForeigner: boolean;
  passportRaw: string | null;
  addedOn: string; // YYYY-MM-DD
  comment: string | null;

  blacklisted: boolean;
  blacklistReason: string | null;
  blacklistAt: string | null;
  blacklistBy: string | null;
  unreachable: boolean;
  /** v0.3.9: баланс депозита (неиспользованные средства). */
  depositBalance?: number;
  /**
   * v0.5.6: агрегат непогашенного долга по ущербу клиента по ВСЕМ его
   * арендам (включая завершённые). Сумма = Σ(damage_reports.total
   * − depositCovered − Σ paid damage payments) по всем damage_reports
   * клиента. Используется для метки «опасный клиент» в пикере и для
   * плашки на карточке.
   */
  unpaidDamageDebt?: number;
  /**
   * v0.6: дела-должники клиента (модуль «Должники»). Активные идут первыми.
   * Подмешиваются в GET /api/clients/:id и /api/clients. Карточка клиента
   * показывает метку «Должник», вкладку с прогрессом и графиком платежей.
   */
  debtorCases?: import("@/lib/debtors/types").DebtorCaseSummary[];

  birthDate: string | null;
  passportSeries: string | null;
  passportNumber: string | null;
  passportIssuedOn: string | null;
  passportIssuer: string | null;
  passportDivisionCode: string | null;
  passportRegistration: string | null;

  licenseNumber: string | null;
  licenseCategories: string | null;
  licenseIssuedOn: string | null;
  licenseExpiresOn: string | null;

  createdAt: string; // ISO
  updatedAt: string;
};

export type ScooterModel = "jog" | "gear" | "honda" | "tank";
export type ScooterBaseStatus =
  | "ready"
  | "rental_pool"
  | "repair"
  | "buyout"
  | "for_sale"
  | "sold"
  | "disassembly"
  | "dtp";

export type ApiScooter = {
  id: number;
  name: string;
  model: ScooterModel;
  modelId: number | null;
  vin: string | null;
  engineNo: string | null;
  frameNumber: string | null;
  year: number | null;
  color: string | null;
  mileage: number;
  baseStatus: ScooterBaseStatus;
  purchaseDate: string | null;
  purchasePrice: number | null;
  marketValue: number | null;
  lastOilChangeMileage: number | null;
  note: string | null;
  archivedAt: string | null;
  archivedBy: string | null;
  archivedReason: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RentalStatus = "active" | "completed";

export type RentalSourceChannel =
  | "avito"
  | "repeat"
  | "ref"
  | "passing"
  | "other";

/**
 * UI-периоды. В БД хранится только short/week/month — "day" мапится в "short"
 * перед отправкой на сервер (см. rentalsStore.createRental).
 */
export type TariffPeriod = "day" | "short" | "week" | "month";
// v0.4.34: 'deposit' — спец-метод для платежей, профинансированных
// из залога (rental.deposit) или из депозита клиента
// (clients.deposit_balance). Исключается из revenue.
export type PaymentMethod = "cash" | "card" | "transfer" | "deposit";

export type RentalEquipmentItem = {
  itemId?: number | null;
  name: string;
  price: number;
  free: boolean;
};

export type ApiRental = {
  id: number;
  clientId: number;
  scooterId: number | null;
  parentRentalId: number | null;
  status: RentalStatus;
  sourceChannel: RentalSourceChannel | null;
  tariffPeriod: TariffPeriod;
  rate: number;
  /** v0.4.25: 'day' (default) или 'week' — единица измерения тарифа. */
  rateUnit?: "day" | "week";
  /** #168: создана по произвольному («своему») тарифу. */
  customTariff?: boolean;
  deposit: number;
  /** v0.4.49: snapshot исходной суммы залога. Текущий deposit может
   *  быть меньше из-за списаний на ущерб/просрочку — UI показывает
   *  плашку «Залог X из Y» когда deposit < depositOriginal. */
  depositOriginal?: number;
  depositItem: string | null;
  depositReturned: boolean | null;
  startAt: string; // ISO
  endPlannedAt: string;
  endActualAt: string | null;
  days: number;
  sum: number;
  paymentMethod: PaymentMethod;
  contractUploaded: boolean;
  equipment: string[];
  equipmentJson: RentalEquipmentItem[];
  damageAmount: number | null;
  note: string | null;
  /** Архив (soft-delete). null если активна. */
  archivedAt: string | null;
  archivedBy: string | null;
  /** Причина удаления в архив («Создано случайно» и т.п.). v0.6.51. */
  archivedReason: string | null;
  createdAt: string;
  updatedAt: string;
};

/* обёртки списков из API */
export type ListResponse<T> = { items: T[] };
