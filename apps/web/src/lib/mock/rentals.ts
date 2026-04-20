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
  | "cancelled";

export type PaymentMethod = "cash" | "card" | "transfer";

export type Rental = {
  id: number;
  clientId: number;
  scooter: string;
  start: string;
  endPlanned: string;
  endActual?: string;
  status: RentalStatus;
  rate: number;
  days: number;
  sum: number;
  deposit: number;
  depositReturned?: boolean;
  equipment: string[];
  paymentMethod: PaymentMethod;
  note?: string;
};

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
  // ===== ACTIVE (идут сейчас) =====
  { id: 101, clientId: 17, scooter: "Jog #07", start: "14.09.2026", endPlanned: "14.10.2026", status: "active",
    rate: 450, days: 30, sum: 13500, deposit: 2000, equipment: ["шлем"], paymentMethod: "card" },
  { id: 102, clientId: 17, scooter: "Jog #23", start: "01.10.2026", endPlanned: "31.10.2026", status: "active",
    rate: 450, days: 30, sum: 13500, deposit: 2000, equipment: ["шлем", "держатель"], paymentMethod: "card" },
  { id: 103, clientId: 1,  scooter: "Jog #02", start: "05.10.2026", endPlanned: "19.10.2026", status: "active",
    rate: 500, days: 14, sum: 7000, deposit: 2000, equipment: ["шлем"], paymentMethod: "cash" },
  { id: 104, clientId: 1,  scooter: "Jog #11", start: "12.10.2026", endPlanned: "15.10.2026", status: "active",
    rate: 500, days: 3, sum: 1500, deposit: 2000, equipment: [], paymentMethod: "cash" },
  { id: 105, clientId: 2,  scooter: "Gear #04", start: "01.10.2026", endPlanned: "31.10.2026", status: "active",
    rate: 550, days: 30, sum: 16500, deposit: 2000, equipment: ["шлем"], paymentMethod: "card" },
  { id: 106, clientId: 4,  scooter: "Jog #17", start: "28.09.2026", endPlanned: "28.10.2026", status: "active",
    rate: 450, days: 30, sum: 13500, deposit: 2000, equipment: ["шлем", "держатель"], paymentMethod: "card" },
  { id: 107, clientId: 6,  scooter: "Gear #09", start: "10.10.2026", endPlanned: "24.10.2026", status: "active",
    rate: 600, days: 14, sum: 8400, deposit: 2000, equipment: ["шлем"], paymentMethod: "card" },
  { id: 108, clientId: 6,  scooter: "Jog #18", start: "02.10.2026", endPlanned: "16.10.2026", status: "active",
    rate: 500, days: 14, sum: 7000, deposit: 2000, equipment: [], paymentMethod: "cash" },
  { id: 109, clientId: 8,  scooter: "Tank #02", start: "05.10.2026", endPlanned: "19.10.2026", status: "active",
    rate: 700, days: 14, sum: 9800, deposit: 2000, equipment: ["шлем", "держатель"], paymentMethod: "card" },
  { id: 110, clientId: 9,  scooter: "Gear #12", start: "08.10.2026", endPlanned: "22.10.2026", status: "active",
    rate: 550, days: 14, sum: 7700, deposit: 2000, equipment: ["шлем"], paymentMethod: "card" },
  { id: 111, clientId: 11, scooter: "Jog #05", start: "03.10.2026", endPlanned: "17.10.2026", status: "active",
    rate: 450, days: 14, sum: 6300, deposit: 2000, equipment: [], paymentMethod: "card" },
  { id: 112, clientId: 14, scooter: "Jog #25", start: "12.10.2026", endPlanned: "14.10.2026", status: "active",
    rate: 500, days: 2, sum: 1000, deposit: 2000, equipment: ["шлем"], paymentMethod: "cash",
    note: "тест-драйв на 2 дня" },
  { id: 113, clientId: 19, scooter: "Gear #07", start: "06.10.2026", endPlanned: "20.10.2026", status: "active",
    rate: 550, days: 14, sum: 7700, deposit: 2000, equipment: ["шлем"], paymentMethod: "card" },
  { id: 114, clientId: 22, scooter: "Jog #14", start: "11.10.2026", endPlanned: "18.10.2026", status: "active",
    rate: 500, days: 7, sum: 3500, deposit: 2000, equipment: [], paymentMethod: "cash" },
  { id: 115, clientId: 24, scooter: "Gear #15", start: "01.10.2026", endPlanned: "31.10.2026", status: "active",
    rate: 550, days: 30, sum: 16500, deposit: 2000, equipment: ["шлем", "держатель"], paymentMethod: "card" },
  { id: 116, clientId: 26, scooter: "Jog #29", start: "04.10.2026", endPlanned: "18.10.2026", status: "active",
    rate: 450, days: 14, sum: 6300, deposit: 2000, equipment: ["шлем"], paymentMethod: "card" },
  { id: 117, clientId: 26, scooter: "Tank #04", start: "10.10.2026", endPlanned: "17.10.2026", status: "active",
    rate: 700, days: 7, sum: 4900, deposit: 2000, equipment: ["шлем"], paymentMethod: "card" },
  { id: 118, clientId: 29, scooter: "Jog #08", start: "07.10.2026", endPlanned: "21.10.2026", status: "active",
    rate: 500, days: 14, sum: 7000, deposit: 2000, equipment: [], paymentMethod: "cash" },
  { id: 119, clientId: 31, scooter: "Gear #03", start: "09.10.2026", endPlanned: "23.10.2026", status: "active",
    rate: 550, days: 14, sum: 7700, deposit: 2000, equipment: ["шлем"], paymentMethod: "card" },
  { id: 120, clientId: 34, scooter: "Jog #22", start: "02.10.2026", endPlanned: "16.10.2026", status: "active",
    rate: 500, days: 14, sum: 7000, deposit: 2000, equipment: ["шлем"], paymentMethod: "card" },
  { id: 121, clientId: 34, scooter: "Gear #18", start: "06.10.2026", endPlanned: "13.10.2026", status: "active",
    rate: 550, days: 7, sum: 3850, deposit: 2000, equipment: [], paymentMethod: "cash",
    note: "возврат сегодня — нужно встретить" },
  { id: 122, clientId: 36, scooter: "Jog #30", start: "08.10.2026", endPlanned: "15.10.2026", status: "active",
    rate: 500, days: 7, sum: 3500, deposit: 2000, equipment: [], paymentMethod: "card" },
  { id: 123, clientId: 38, scooter: "Tank #01", start: "05.10.2026", endPlanned: "19.10.2026", status: "active",
    rate: 700, days: 14, sum: 9800, deposit: 2000, equipment: ["шлем", "держатель"], paymentMethod: "card" },
  { id: 124, clientId: 40, scooter: "Jog #03", start: "11.10.2026", endPlanned: "14.10.2026", status: "active",
    rate: 500, days: 3, sum: 1500, deposit: 2000, equipment: [], paymentMethod: "cash" },
  { id: 125, clientId: 42, scooter: "Gear #11", start: "01.10.2026", endPlanned: "15.10.2026", status: "active",
    rate: 550, days: 14, sum: 7700, deposit: 2000, equipment: ["шлем"], paymentMethod: "card" },

  // ===== OVERDUE (просрочка — из дашборда «Просрочено: 3») =====
  { id: 130, clientId: 3,  scooter: "Jog #04", start: "25.09.2026", endPlanned: "09.10.2026", status: "overdue",
    rate: 500, days: 14, sum: 8400, deposit: 2000, equipment: ["шлем"], paymentMethod: "cash",
    note: "просрочен возврат на 4 дня, клиент обещал вернуть завтра" },
  { id: 131, clientId: 16, scooter: "Gear #06", start: "20.09.2026", endPlanned: "11.10.2026", status: "overdue",
    rate: 550, days: 21, sum: 11550, deposit: 2000, equipment: [], paymentMethod: "card",
    note: "обещает вернуть после зарплаты" },
  { id: 132, clientId: 21, scooter: "Jog #20", start: "29.09.2026", endPlanned: "12.10.2026", status: "overdue",
    rate: 500, days: 14, sum: 7000, deposit: 2000, equipment: ["шлем"], paymentMethod: "cash",
    note: "первый раз пропустил платёж" },
  { id: 133, clientId: 33, scooter: "Jog #13", start: "28.09.2026", endPlanned: "12.10.2026", status: "overdue",
    rate: 450, days: 14, sum: 6300, deposit: 2000, equipment: [], paymentMethod: "card",
    note: "должен 1800 ₽ до пятницы" },
  { id: 134, clientId: 39, scooter: "Gear #02", start: "20.09.2026", endPlanned: "04.10.2026", status: "overdue",
    rate: 550, days: 14, sum: 7700, deposit: 2000, equipment: [], paymentMethod: "cash",
    note: "пропустил возврат, ссылается на жену" },
  { id: 135, clientId: 28, scooter: "Jog #16", start: "22.09.2026", endPlanned: "06.10.2026", status: "overdue",
    rate: 500, days: 14, sum: 7000, deposit: 2000, equipment: [], paymentMethod: "cash",
    note: "просрочка 1 неделя" },

  // ===== RETURNING (возвращают прямо сейчас) =====
  { id: 140, clientId: 13, scooter: "Gear #01", start: "01.10.2026", endPlanned: "13.10.2026", status: "returning",
    rate: 550, days: 12, sum: 6600, deposit: 2000, equipment: ["шлем"], paymentMethod: "card",
    note: "осмотр 13.10 в 14:00" },

  // ===== COMPLETED_DAMAGE =====
  { id: 150, clientId: 10, scooter: "Jog #12", start: "10.04.2026", endPlanned: "20.04.2026", endActual: "23.04.2026",
    status: "completed_damage", rate: 500, days: 13, sum: 7800, deposit: 3000, depositReturned: false,
    equipment: ["шлем"], paymentMethod: "cash",
    note: "вернул на 3 дня позже, штраф 3200 ₽ не погашен" },

  // ===== POLICE =====
  { id: 160, clientId: 5, scooter: "Jog #12", start: "11.04.2026", endPlanned: "25.04.2026", status: "police",
    rate: 500, days: 14, sum: 14200, deposit: 3000, equipment: ["шлем"], paymentMethod: "cash",
    note: "скутер не возвращён, заявление в ОВД 18.04.2026" },

  // ===== NEW_REQUEST (новые заявки без встречи) =====
  { id: 170, clientId: 7,  scooter: "—", start: "13.10.2026", endPlanned: "—", status: "new_request",
    rate: 0, days: 0, sum: 0, deposit: 0, equipment: [], paymentMethod: "cash",
    note: "хочет Jog на 2 недели, перезвонить после 18:00" },
  { id: 171, clientId: 18, scooter: "—", start: "13.10.2026", endPlanned: "—", status: "new_request",
    rate: 0, days: 0, sum: 0, deposit: 0, equipment: [], paymentMethod: "cash",
    note: "интересуется Tank для курьерской работы" },

  // ===== MEETING (встреча назначена) =====
  { id: 180, clientId: 25, scooter: "Jog #06", start: "14.10.2026", endPlanned: "28.10.2026", status: "meeting",
    rate: 450, days: 14, sum: 6300, deposit: 2000, equipment: ["шлем"], paymentMethod: "card",
    note: "встреча 14.10 в 11:00" },
  { id: 181, clientId: 37, scooter: "Gear #17", start: "14.10.2026", endPlanned: "21.10.2026", status: "meeting",
    rate: 550, days: 7, sum: 3850, deposit: 2000, equipment: [], paymentMethod: "cash",
    note: "встреча 14.10 в 16:30, привезёт паспорт" },

  // ===== COMPLETED (историческая база) =====
  { id: 200, clientId: 17, scooter: "Jog #11", start: "10.07.2026", endPlanned: "25.07.2026", endActual: "25.07.2026",
    status: "completed", rate: 450, days: 15, sum: 6750, deposit: 2000, depositReturned: true,
    equipment: ["шлем"], paymentMethod: "card" },
  { id: 201, clientId: 17, scooter: "Jog #07", start: "20.05.2026", endPlanned: "10.06.2026", endActual: "10.06.2026",
    status: "completed", rate: 450, days: 21, sum: 9450, deposit: 2000, depositReturned: true,
    equipment: [], paymentMethod: "card" },
  { id: 202, clientId: 10, scooter: "Gear #05", start: "05.03.2026", endPlanned: "12.03.2026", endActual: "12.03.2026",
    status: "completed", rate: 550, days: 7, sum: 3850, deposit: 2000, depositReturned: true,
    equipment: [], paymentMethod: "cash" },
  { id: 203, clientId: 10, scooter: "Tank #05", start: "10.02.2026", endPlanned: "15.02.2026", endActual: "15.02.2026",
    status: "completed", rate: 700, days: 5, sum: 3500, deposit: 2000, depositReturned: true,
    equipment: [], paymentMethod: "card" },
  { id: 204, clientId: 1,  scooter: "Jog #09", start: "05.09.2026", endPlanned: "20.09.2026", endActual: "20.09.2026",
    status: "completed", rate: 500, days: 15, sum: 7500, deposit: 2000, depositReturned: true,
    equipment: ["шлем"], paymentMethod: "card" },
  { id: 205, clientId: 6,  scooter: "Gear #13", start: "15.08.2026", endPlanned: "01.09.2026", endActual: "01.09.2026",
    status: "completed", rate: 550, days: 17, sum: 9350, deposit: 2000, depositReturned: true,
    equipment: ["шлем"], paymentMethod: "card" },
  { id: 206, clientId: 26, scooter: "Jog #24", start: "20.08.2026", endPlanned: "05.09.2026", endActual: "05.09.2026",
    status: "completed", rate: 450, days: 16, sum: 7200, deposit: 2000, depositReturned: true,
    equipment: ["шлем", "держатель"], paymentMethod: "card" },

  // ===== CANCELLED =====
  { id: 250, clientId: 27, scooter: "Jog #28", start: "11.10.2026", endPlanned: "—", status: "cancelled",
    rate: 500, days: 0, sum: 0, deposit: 0, equipment: [], paymentMethod: "cash",
    note: "клиент не пришёл на встречу" },
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
