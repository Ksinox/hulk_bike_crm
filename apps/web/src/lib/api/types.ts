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
  addedOn: string; // YYYY-MM-DD
  comment: string | null;

  blacklisted: boolean;
  blacklistReason: string | null;
  blacklistAt: string | null;
  blacklistBy: string | null;
  unreachable: boolean;

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
  | "sold";

export type ApiScooter = {
  id: number;
  name: string;
  model: ScooterModel;
  vin: string | null;
  engineNo: string | null;
  mileage: number;
  baseStatus: ScooterBaseStatus;
  purchaseDate: string | null;
  purchasePrice: number | null;
  lastOilChangeMileage: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RentalStatus =
  | "new_request"
  | "meeting"
  | "active"
  | "overdue"
  | "returning"
  | "completed"
  | "completed_damage"
  | "cancelled"
  | "police"
  | "court";

export type RentalSourceChannel =
  | "avito"
  | "repeat"
  | "ref"
  | "passing"
  | "other";

export type TariffPeriod = "short" | "week" | "month";
export type PaymentMethod = "cash" | "card" | "transfer";

export type ApiRental = {
  id: number;
  clientId: number;
  scooterId: number | null;
  parentRentalId: number | null;
  status: RentalStatus;
  sourceChannel: RentalSourceChannel | null;
  tariffPeriod: TariffPeriod;
  rate: number;
  deposit: number;
  depositReturned: boolean | null;
  startAt: string; // ISO
  endPlannedAt: string;
  endActualAt: string | null;
  days: number;
  sum: number;
  paymentMethod: PaymentMethod;
  contractUploaded: boolean;
  paymentConfirmedBy: "boss" | "manager" | null;
  paymentConfirmedByName: string | null;
  paymentConfirmedAt: string | null;
  equipment: string[];
  damageAmount: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

/* обёртки списков из API */
export type ListResponse<T> = { items: T[] };
