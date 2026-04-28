export type RentalStatus =
  | "new_request"
  | "meeting"
  | "active"
  | "overdue"
  | "returning"
  | "completed"
  | "completed_damage"
  | "police"
  | "court"
  | "problem"
  | "cancelled";

export type PaymentMethod = "cash" | "card" | "transfer";

/** Канал обращения для конкретной аренды (может отличаться от канала клиента) */
export type RentalSourceChannel =
  | "avito"
  | "repeat"
  | "ref"
  | "passing"
  | "other";

export const RENTAL_SOURCE_LABEL: Record<RentalSourceChannel, string> = {
  avito: "авито",
  repeat: "повторный",
  ref: "рекомендация",
  passing: "проходящий",
  other: "другой",
};

export type ScooterModel = "jog" | "gear" | "honda" | "tank";

/**
 * UI-периоды тарифа.
 *  - "day" → 1–2 дня (dayRate)
 *  - "short" → 3–6 дней (shortRate)
 *  - "week" → 7–29 дней (weekRate)
 *  - "month" → 30+ дней (monthRate)
 *
 * В БД enum = short/week/month. На сохранении период "day" мапится в "short"
 * (это всё ещё короткий прокат), а ставка берётся из dayRate модели.
 */
export type TariffPeriod = "day" | "short" | "week" | "month";

export type ConfirmerRole = "admin" | "director";

export type PaymentConfirmation = {
  by: ConfirmerRole;
  byName: string;
  at: string;
};

export type Rental = {
  id: number;
  clientId: number;
  scooter: string;
  model: ScooterModel;
  /** Дата выдачи, DD.MM.YYYY */
  start: string;
  /** Время выдачи, HH:MM (по умолчанию 12:00 если не указано) */
  startTime?: string;
  /** Плановый возврат, DD.MM.YYYY. Время такое же как startTime */
  endPlanned: string;
  endActual?: string;
  status: RentalStatus;
  tariffPeriod: TariffPeriod;
  rate: number;
  days: number;
  sum: number;
  deposit: number;
  depositReturned?: boolean;
  equipment: string[];
  paymentMethod: PaymentMethod;
  note?: string;
  contractUploaded?: boolean;
  paymentConfirmed?: PaymentConfirmation | null;
  /** Канал обращения именно по этой аренде — откуда пришёл запрос */
  sourceChannel?: RentalSourceChannel;
  /**
   * Id «родителя» — предыдущей аренды в цепочке продлений.
   * null/undefined у корневой (первой) аренды серии.
   */
  parentRentalId?: number;
  /** Числовой id связанного скутера (из fleet) — заполняется адаптером API */
  scooterId?: number;
  /** ISO-дата архивации (soft-delete). null/undefined если активна. */
  archivedAt?: string | null;
  archivedBy?: string | null;
  /**
   * Сумма ущерба по аренде, ₽ — выставляется вручную администратором
   * (например после ДТП или повреждения скутера). 0/undefined — ущерба нет.
   */
  damageAmount?: number;
};

/** Фиксированный залог согласно договору аренды */
export const DEPOSIT_AMOUNT = 2000;

/** Минимальный срок аренды — 1 сутки (тариф «1–3 дня» по 1300₽). */
export const MIN_RENTAL_DAYS = 1;

export const MODEL_LABEL: Record<ScooterModel, string> = {
  jog: "Yamaha Jog",
  gear: "Yamaha Gear",
  honda: "Honda DIO",
  tank: "Tank",
};

/**
 * Актуальный прайс (Вариант Б — реальный прайс из переписки с клиентами).
 * Источник: 02_структурированные_знания/03_процесс_аренды.md
 */
export const TARIFF: Record<ScooterModel, Record<TariffPeriod, number>> = {
  honda: { day: 1300, short: 400, week: 350, month: 300 },
  jog: { day: 1300, short: 600, week: 500, month: 400 },
  gear: { day: 1300, short: 700, week: 600, month: 500 },
  tank: { day: 1300, short: 700, week: 700, month: 700 },
};

export const TARIFF_PERIOD_LABEL: Record<TariffPeriod, string> = {
  day: "1–2 дня",
  short: "3–6 дней",
  week: "7–29 дней",
  month: "30+ дней",
};

/** Определяет тарифный период по количеству дней */
export function periodForDays(days: number): TariffPeriod {
  if (days <= 2) return "day";
  if (days <= 6) return "short";
  if (days < 30) return "week";
  return "month";
}

/**
 * Штраф за просрочку возврата.
 * 60-120 мин = 1/2 суточной ставки, > 120 мин = 300 ₽/час (считается в час-за-час).
 * Источник: договор аренды, 10_правила_бизнеса.md
 *
 * Важно: аренда оплачивается единовременно при выдаче, поэтому «просрочка оплаты»
 * (200 ₽/день) к аренде не применяется — это правило для рассрочек.
 */
export function overdueReturnFine(hoursLate: number, rate: number): number {
  if (hoursLate < 1) return 0;
  if (hoursLate <= 2) return Math.round(rate / 2);
  return hoursLate * 300;
}

/**
 * Штраф за просрочку платежа по рассрочке: 200 ₽/день.
 * НЕ применяется к арендам — оплата аренды получается при выдаче.
 */
export function installmentOverdueFine(days: number): number {
  return days * 200;
}

/** Парсит DD.MM.YYYY + HH:MM в Date */
export function parseRentalDateTime(date: string, time = "12:00"): Date | null {
  const dm = date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!dm) return null;
  const [h = "12", m = "00"] = time.split(":");
  return new Date(+dm[3], +dm[2] - 1, +dm[1], +h, +m);
}

/** Часы просрочки на момент момент `nowAt` */
export function hoursOverdue(rental: Rental, nowAt: Date): number {
  const end = parseRentalDateTime(rental.endPlanned, rental.startTime);
  if (!end) return 0;
  return Math.max(0, (nowAt.getTime() - end.getTime()) / 3_600_000);
}

export const STATUS_LABEL: Record<RentalStatus, string> = {
  new_request: "Новая заявка",
  meeting: "Встреча",
  active: "Активна",
  overdue: "Просрочка",
  returning: "Возврат",
  completed: "Завершена",
  completed_damage: "Завершена с ущербом",
  police: "Полиция",
  court: "Суд",
  problem: "Проблемная",
  cancelled: "Отменена",
};

export const STATUS_TONE: Record<
  RentalStatus,
  "green" | "blue" | "red" | "orange" | "purple" | "gray"
> = {
  new_request: "blue",
  meeting: "blue",
  active: "green",
  overdue: "red",
  returning: "orange",
  completed: "gray",
  completed_damage: "red",
  police: "red",
  court: "purple",
  problem: "red",
  cancelled: "gray",
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "наличные",
  card: "карта",
  transfer: "перевод",
};

/**
 * Единый источник истины по арендам — связывает клиентов и скутеры.
 * clientId → CLIENTS[id], scooter — имя из mockPark.
 * Сегодня по демо-таймлайну: 13.10.2026.
 */
export const RENTALS: Rental[] = [
  // ===== ACTIVE =====
  { id: 101, clientId: 17, scooter: "Jog #07", model: "jog", start: "14.09.2026", endPlanned: "14.10.2026",
    status: "active", tariffPeriod: "month", rate: 400, days: 30, sum: 12000, deposit: 2000,
    equipment: ["шлем"], paymentMethod: "card" },
  { id: 102, clientId: 17, scooter: "Jog #23", model: "jog", start: "01.10.2026", endPlanned: "31.10.2026",
    status: "active", tariffPeriod: "month", rate: 400, days: 30, sum: 12000, deposit: 2000,
    equipment: ["шлем", "держатель"], paymentMethod: "card" },
  { id: 103, clientId: 1, scooter: "Jog #02", model: "jog", start: "05.10.2026", endPlanned: "19.10.2026",
    status: "active", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000,
    equipment: ["шлем"], paymentMethod: "cash" },
  { id: 104, clientId: 1, scooter: "Jog #11", model: "jog", start: "12.10.2026", endPlanned: "15.10.2026",
    status: "active", tariffPeriod: "short", rate: 600, days: 3, sum: 1800, deposit: 2000,
    equipment: [], paymentMethod: "cash" },
  { id: 105, clientId: 2, scooter: "Gear #04", model: "gear", start: "01.10.2026", endPlanned: "31.10.2026",
    status: "active", tariffPeriod: "month", rate: 500, days: 30, sum: 15000, deposit: 2000,
    equipment: ["шлем"], paymentMethod: "card" },
  { id: 106, clientId: 4, scooter: "Jog #17", model: "jog", start: "28.09.2026", endPlanned: "28.10.2026",
    status: "active", tariffPeriod: "month", rate: 400, days: 30, sum: 12000, deposit: 2000,
    equipment: ["шлем", "держатель"], paymentMethod: "card" },
  { id: 107, clientId: 6, scooter: "Gear #09", model: "gear", start: "10.10.2026", endPlanned: "24.10.2026",
    status: "active", tariffPeriod: "week", rate: 600, days: 14, sum: 8400, deposit: 2000,
    equipment: ["шлем"], paymentMethod: "card" },
  { id: 108, clientId: 6, scooter: "Jog #18", model: "jog", start: "02.10.2026", endPlanned: "16.10.2026",
    status: "active", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000,
    equipment: [], paymentMethod: "cash" },
  { id: 109, clientId: 8, scooter: "Tank #02", model: "tank", start: "05.10.2026", endPlanned: "19.10.2026",
    status: "active", tariffPeriod: "week", rate: 700, days: 14, sum: 9800, deposit: 2000,
    equipment: ["шлем", "держатель"], paymentMethod: "card" },
  { id: 110, clientId: 9, scooter: "Gear #12", model: "gear", start: "08.10.2026", endPlanned: "22.10.2026",
    status: "active", tariffPeriod: "week", rate: 600, days: 14, sum: 8400, deposit: 2000,
    equipment: ["шлем"], paymentMethod: "card" },
  { id: 111, clientId: 11, scooter: "Jog #05", model: "jog", start: "03.10.2026", endPlanned: "17.10.2026",
    status: "active", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000,
    equipment: [], paymentMethod: "card" },
  { id: 112, clientId: 14, scooter: "Jog #25", model: "jog", start: "12.10.2026", endPlanned: "14.10.2026",
    status: "active", tariffPeriod: "short", rate: 600, days: 2, sum: 1200, deposit: 2000,
    equipment: ["шлем"], paymentMethod: "cash", note: "тест-драйв на 2 дня" },
  { id: 113, clientId: 19, scooter: "Gear #07", model: "gear", start: "06.10.2026", endPlanned: "20.10.2026",
    status: "active", tariffPeriod: "week", rate: 600, days: 14, sum: 8400, deposit: 2000,
    equipment: ["шлем"], paymentMethod: "card" },
  { id: 114, clientId: 22, scooter: "Jog #14", model: "jog", start: "11.10.2026", endPlanned: "18.10.2026",
    status: "active", tariffPeriod: "week", rate: 500, days: 7, sum: 3500, deposit: 2000,
    equipment: [], paymentMethod: "cash" },
  { id: 115, clientId: 24, scooter: "Gear #15", model: "gear", start: "01.10.2026", endPlanned: "31.10.2026",
    status: "active", tariffPeriod: "month", rate: 500, days: 30, sum: 15000, deposit: 2000,
    equipment: ["шлем", "держатель"], paymentMethod: "card" },
  { id: 116, clientId: 26, scooter: "Jog #29", model: "jog", start: "04.10.2026", endPlanned: "18.10.2026",
    status: "active", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000,
    equipment: ["шлем"], paymentMethod: "card" },
  { id: 117, clientId: 26, scooter: "Tank #04", model: "tank", start: "10.10.2026", endPlanned: "17.10.2026",
    status: "active", tariffPeriod: "week", rate: 700, days: 7, sum: 4900, deposit: 2000,
    equipment: ["шлем"], paymentMethod: "card" },
  { id: 118, clientId: 29, scooter: "Jog #08", model: "jog", start: "07.10.2026", endPlanned: "21.10.2026",
    status: "active", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000,
    equipment: [], paymentMethod: "cash" },
  { id: 119, clientId: 31, scooter: "Gear #03", model: "gear", start: "09.10.2026", endPlanned: "23.10.2026",
    status: "active", tariffPeriod: "week", rate: 600, days: 14, sum: 8400, deposit: 2000,
    equipment: ["шлем"], paymentMethod: "card" },
  { id: 120, clientId: 34, scooter: "Jog #22", model: "jog", start: "02.10.2026", endPlanned: "16.10.2026",
    status: "active", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000,
    equipment: ["шлем"], paymentMethod: "card" },
  { id: 121, clientId: 34, scooter: "Gear #18", model: "gear", start: "06.10.2026", endPlanned: "13.10.2026",
    status: "active", tariffPeriod: "week", rate: 600, days: 7, sum: 4200, deposit: 2000,
    equipment: [], paymentMethod: "cash", note: "возврат сегодня — нужно встретить" },
  { id: 122, clientId: 36, scooter: "Jog #30", model: "jog", start: "08.10.2026", endPlanned: "15.10.2026",
    status: "active", tariffPeriod: "week", rate: 500, days: 7, sum: 3500, deposit: 2000,
    equipment: [], paymentMethod: "card" },
  { id: 123, clientId: 38, scooter: "Tank #01", model: "tank", start: "05.10.2026", endPlanned: "19.10.2026",
    status: "active", tariffPeriod: "week", rate: 700, days: 14, sum: 9800, deposit: 2000,
    equipment: ["шлем", "держатель"], paymentMethod: "card" },
  { id: 124, clientId: 40, scooter: "Jog #03", model: "jog", start: "11.10.2026", endPlanned: "14.10.2026",
    status: "active", tariffPeriod: "short", rate: 600, days: 3, sum: 1800, deposit: 2000,
    equipment: [], paymentMethod: "cash" },
  { id: 125, clientId: 42, scooter: "Gear #11", model: "gear", start: "01.10.2026", endPlanned: "15.10.2026",
    status: "active", tariffPeriod: "week", rate: 600, days: 14, sum: 8400, deposit: 2000,
    equipment: ["шлем"], paymentMethod: "card" },

  // ===== OVERDUE =====
  { id: 130, clientId: 3, scooter: "Jog #04", model: "jog", start: "25.09.2026", startTime: "11:00",
    endPlanned: "09.10.2026",
    status: "overdue", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000,
    equipment: ["шлем"], paymentMethod: "cash",
    note: "просрочен возврат на 4 дня, клиент обещал вернуть завтра" },
  { id: 131, clientId: 16, scooter: "Gear #06", model: "gear", start: "20.09.2026", startTime: "15:30",
    endPlanned: "11.10.2026",
    status: "overdue", tariffPeriod: "week", rate: 600, days: 21, sum: 12600, deposit: 2000,
    equipment: [], paymentMethod: "transfer", note: "обещает вернуть после зарплаты" },
  { id: 132, clientId: 21, scooter: "Jog #20", model: "jog", start: "29.09.2026", startTime: "10:00",
    endPlanned: "12.10.2026",
    status: "overdue", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000,
    equipment: ["шлем"], paymentMethod: "cash", note: "первый раз пропустил платёж" },
  { id: 133, clientId: 33, scooter: "Jog #13", model: "jog", start: "28.09.2026", startTime: "09:00",
    endPlanned: "12.10.2026",
    status: "overdue", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000,
    equipment: [], paymentMethod: "transfer", note: "должен 1800 ₽ до пятницы" },
  { id: 134, clientId: 39, scooter: "Gear #02", model: "gear", start: "20.09.2026", startTime: "14:00",
    endPlanned: "04.10.2026",
    status: "overdue", tariffPeriod: "week", rate: 600, days: 14, sum: 8400, deposit: 2000,
    equipment: [], paymentMethod: "cash", note: "пропустил возврат, ссылается на жену" },
  { id: 135, clientId: 28, scooter: "Jog #16", model: "jog", start: "22.09.2026", startTime: "16:00",
    endPlanned: "06.10.2026",
    status: "overdue", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000,
    equipment: [], paymentMethod: "cash", note: "просрочка 1 неделя" },

  // ===== RETURNING =====
  { id: 140, clientId: 13, scooter: "Gear #01", model: "gear", start: "01.10.2026", endPlanned: "13.10.2026",
    status: "returning", tariffPeriod: "week", rate: 600, days: 12, sum: 7200, deposit: 2000,
    equipment: ["шлем"], paymentMethod: "card", note: "осмотр 13.10 в 14:00" },

  // ===== COMPLETED_DAMAGE =====
  { id: 150, clientId: 10, scooter: "Jog #12", model: "jog", start: "10.04.2026", endPlanned: "20.04.2026",
    endActual: "23.04.2026", status: "completed_damage", tariffPeriod: "week", rate: 500, days: 13, sum: 6500,
    deposit: 2000, depositReturned: false, equipment: ["шлем"], paymentMethod: "cash",
    note: "вернул на 3 дня позже, штраф 3200 ₽ не погашен" },

  // ===== POLICE =====
  { id: 160, clientId: 5, scooter: "Jog #12", model: "jog", start: "11.04.2026", endPlanned: "25.04.2026",
    status: "police", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000,
    equipment: ["шлем"], paymentMethod: "cash",
    note: "скутер не возвращён, заявление в ОВД 18.04.2026" },

  // ===== NEW_REQUEST =====
  { id: 170, clientId: 7, scooter: "—", model: "jog", start: "13.10.2026", endPlanned: "—",
    status: "new_request", tariffPeriod: "week", rate: 0, days: 0, sum: 0, deposit: 0,
    equipment: [], paymentMethod: "cash", note: "хочет Jog на 2 недели, перезвонить после 18:00" },
  { id: 171, clientId: 18, scooter: "—", model: "tank", start: "13.10.2026", endPlanned: "—",
    status: "new_request", tariffPeriod: "week", rate: 0, days: 0, sum: 0, deposit: 0,
    equipment: [], paymentMethod: "cash", note: "интересуется Tank для курьерской работы" },

  // ===== MEETING =====
  { id: 180, clientId: 25, scooter: "Jog #06", model: "jog", start: "14.10.2026", endPlanned: "28.10.2026",
    status: "meeting", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000,
    equipment: ["шлем"], paymentMethod: "card", note: "встреча 14.10 в 11:00" },
  { id: 181, clientId: 37, scooter: "Gear #17", model: "gear", start: "14.10.2026", endPlanned: "21.10.2026",
    status: "meeting", tariffPeriod: "week", rate: 600, days: 7, sum: 4200, deposit: 2000,
    equipment: [], paymentMethod: "cash", note: "встреча 14.10 в 16:30, привезёт паспорт" },

  // ===== COMPLETED (историческая база) =====
  { id: 200, clientId: 17, scooter: "Jog #11", model: "jog", start: "10.07.2026", endPlanned: "25.07.2026",
    endActual: "25.07.2026", status: "completed", tariffPeriod: "week", rate: 500, days: 15, sum: 7500,
    deposit: 2000, depositReturned: true, equipment: ["шлем"], paymentMethod: "card" },
  { id: 201, clientId: 17, scooter: "Jog #07", model: "jog", start: "20.05.2026", endPlanned: "10.06.2026",
    endActual: "10.06.2026", status: "completed", tariffPeriod: "week", rate: 500, days: 21, sum: 10500,
    deposit: 2000, depositReturned: true, equipment: [], paymentMethod: "card" },
  { id: 202, clientId: 10, scooter: "Gear #05", model: "gear", start: "05.03.2026", endPlanned: "12.03.2026",
    endActual: "12.03.2026", status: "completed", tariffPeriod: "week", rate: 600, days: 7, sum: 4200,
    deposit: 2000, depositReturned: true, equipment: [], paymentMethod: "cash" },
  { id: 203, clientId: 10, scooter: "Tank #05", model: "tank", start: "10.02.2026", endPlanned: "15.02.2026",
    endActual: "15.02.2026", status: "completed", tariffPeriod: "short", rate: 700, days: 5, sum: 3500,
    deposit: 2000, depositReturned: true, equipment: [], paymentMethod: "card" },
  { id: 204, clientId: 1, scooter: "Jog #09", model: "jog", start: "05.09.2026", endPlanned: "20.09.2026",
    endActual: "20.09.2026", status: "completed", tariffPeriod: "week", rate: 500, days: 15, sum: 7500,
    deposit: 2000, depositReturned: true, equipment: ["шлем"], paymentMethod: "card" },
  { id: 205, clientId: 6, scooter: "Gear #13", model: "gear", start: "15.08.2026", endPlanned: "01.09.2026",
    endActual: "01.09.2026", status: "completed", tariffPeriod: "week", rate: 600, days: 17, sum: 10200,
    deposit: 2000, depositReturned: true, equipment: ["шлем"], paymentMethod: "card" },
  { id: 206, clientId: 26, scooter: "Jog #24", model: "jog", start: "20.08.2026", endPlanned: "05.09.2026",
    endActual: "05.09.2026", status: "completed", tariffPeriod: "week", rate: 500, days: 16, sum: 8000,
    deposit: 2000, depositReturned: true, equipment: ["шлем", "держатель"], paymentMethod: "card" },

  // ===== CANCELLED =====
  { id: 250, clientId: 27, scooter: "Jog #28", model: "jog", start: "11.10.2026", endPlanned: "—",
    status: "cancelled", tariffPeriod: "week", rate: 0, days: 0, sum: 0, deposit: 0,
    equipment: [], paymentMethod: "cash", note: "клиент не пришёл на встречу" },
];

export function getRentalsByClient(clientId: number): Rental[] {
  return RENTALS.filter((r) => r.clientId === clientId);
}

export function getActiveRentals(): Rental[] {
  return RENTALS.filter(
    (r) => r.status === "active" || r.status === "overdue",
  );
}

export function countRentalsByClient(clientId: number): number {
  return RENTALS.filter((r) => r.clientId === clientId).length;
}
