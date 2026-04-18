export type RentalStatus =
  | "active"
  | "overdue"
  | "completed"
  | "incident"
  | "draft";

export type Rental = {
  id: string;
  clientName: string;
  scooter: string;
  startDate: string;
  endDate: string;
  dailyRate: number;
  totalAmount: number;
  status: RentalStatus;
};

export type KpiSnapshot = {
  revenueToday: number;
  revenueTodayDelta: number;
  activeRentals: number;
  activeRentalsDelta: number;
  overduePayments: number;
  overduePaymentsAmount: number;
  openTasks: number;
  openTasksUrgent: number;
};

export type RevenuePoint = { label: string; rental: number; repairs: number };

export type SourceSplit = { label: string; value: number };

export const mockKpi: KpiSnapshot = {
  revenueToday: 24_800,
  revenueTodayDelta: 12,
  activeRentals: 31,
  activeRentalsDelta: 3,
  overduePayments: 4,
  overduePaymentsAmount: 18_600,
  openTasks: 7,
  openTasksUrgent: 2,
};

export const mockRentals: Rental[] = [
  {
    id: "R-1042",
    clientName: "Сахаров И.Н.",
    scooter: "Jog #42",
    startDate: "2026-04-16",
    endDate: "2026-04-23",
    dailyRate: 500,
    totalAmount: 3_500,
    status: "active",
  },
  {
    id: "R-1041",
    clientName: "Волкова Е.М.",
    scooter: "Gear #5",
    startDate: "2026-04-10",
    endDate: "2026-04-17",
    dailyRate: 600,
    totalAmount: 4_200,
    status: "overdue",
  },
  {
    id: "R-1040",
    clientName: "Петров А.С.",
    scooter: "Tank #12",
    startDate: "2026-04-15",
    endDate: "2026-04-22",
    dailyRate: 500,
    totalAmount: 3_500,
    status: "active",
  },
  {
    id: "R-1039",
    clientName: "Иванова О.К.",
    scooter: "Jog #19",
    startDate: "2026-04-08",
    endDate: "2026-04-15",
    dailyRate: 400,
    totalAmount: 2_800,
    status: "completed",
  },
  {
    id: "R-1038",
    clientName: "Громов Д.В.",
    scooter: "Gear #7",
    startDate: "2026-04-12",
    endDate: "2026-04-18",
    dailyRate: 550,
    totalAmount: 3_300,
    status: "incident",
  },
  {
    id: "R-1037",
    clientName: "Соколов П.А.",
    scooter: "Jog #28",
    startDate: "2026-04-14",
    endDate: "2026-04-21",
    dailyRate: 450,
    totalAmount: 3_150,
    status: "active",
  },
];

export const mockRevenueTrend: RevenuePoint[] = [
  { label: "Пн", rental: 18_200, repairs: 1_400 },
  { label: "Вт", rental: 21_500, repairs: 2_100 },
  { label: "Ср", rental: 19_800, repairs: 900 },
  { label: "Чт", rental: 24_100, repairs: 3_200 },
  { label: "Пт", rental: 27_600, repairs: 2_400 },
  { label: "Сб", rental: 31_200, repairs: 1_800 },
  { label: "Вс", rental: 28_400, repairs: 1_200 },
];

export const mockSourceSplit: SourceSplit[] = [
  { label: "Авито", value: 38 },
  { label: "Повторные", value: 34 },
  { label: "Рекомендация", value: 18 },
  { label: "Карты", value: 7 },
  { label: "Другое", value: 3 },
];

export const statusLabel: Record<RentalStatus, string> = {
  active: "Активна",
  overdue: "Просрочка",
  completed: "Завершена",
  incident: "Инцидент",
  draft: "Черновик",
};
