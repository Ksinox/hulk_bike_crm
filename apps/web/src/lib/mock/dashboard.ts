export type ScootStatus =
  | "rented"
  | "overdue"
  | "free"
  | "repair"
  | "rassrochka"
  | "sold";

export type ScootModel = "Yamaha Jog" | "Yamaha Gear" | "Tank";

export type ParkItem = {
  name: string;
  model: ScootModel;
  status: ScootStatus;
};

export type ReturnStatus = "active" | "late" | "soon" | "done";

export type ReturnItem = {
  client: string;
  initials: string;
  scooter: string;
  when: string;
  status: ReturnStatus;
  phone: string;
};

export type OverdueItem = {
  client: string;
  initials: string;
  scooter: string;
  debt: string;
  days: number;
  phone: string;
};

export type TaskIcon =
  | "wrench"
  | "phone"
  | "money"
  | "doc"
  | "bike"
  | "box"
  | "alert";

export type TaskItem = {
  icon: TaskIcon;
  title: string;
  meta: string;
  overdue: boolean;
  done?: boolean;
};

export type ActivityItem = {
  who: string;
  initials: string;
  body: string;
  when: string;
  system?: boolean;
};

export type RevenuePeriod = "day" | "week" | "month";

export type RevenueFrame = {
  value: string;
  unit: string;
  delta: number;
  vs: string;
  chart: number[];
  labels: string[];
};

function buildPark(): ParkItem[] {
  const arr: { name: string; model: ScootModel }[] = [];
  for (let i = 1; i <= 30; i++)
    arr.push({
      name: `Jog #${String(i).padStart(2, "0")}`,
      model: "Yamaha Jog",
    });
  for (let i = 1; i <= 18; i++)
    arr.push({
      name: `Gear #${String(i).padStart(2, "0")}`,
      model: "Yamaha Gear",
    });
  for (let i = 1; i <= 6; i++)
    arr.push({ name: `Tank #${String(i).padStart(2, "0")}`, model: "Tank" });

  const dist: Record<ScootStatus, number> = {
    rented: 34,
    overdue: 3,
    repair: 3,
    free: 10,
    sold: 2,
    rassrochka: 2,
  };
  const statuses: ScootStatus[] = [];
  (Object.entries(dist) as [ScootStatus, number][]).forEach(([k, n]) => {
    for (let i = 0; i < n; i++) statuses.push(k);
  });
  while (statuses.length < 54) statuses.push("free");
  // deterministic shuffle (Фишер–Йетс на sin-ряду, идентично HTML-эталону)
  for (let i = statuses.length - 1; i > 0; i--) {
    const j = Math.floor(((Math.sin(i * 7 + 1) + 1) / 2) * (i + 1));
    [statuses[i], statuses[j]] = [statuses[j], statuses[i]];
  }
  return arr.map((s, i) => ({ ...s, status: statuses[i] }));
}

export const mockPark: ParkItem[] = buildPark();

export const mockReturns: ReturnItem[] = [
  {
    client: "Андрей К.",
    initials: "АК",
    scooter: "Jog #12",
    when: "сегодня 14:00",
    status: "active",
    phone: "+7 928 111-22-33",
  },
  {
    client: "Марина С.",
    initials: "МС",
    scooter: "Gear #07",
    when: "сегодня 18:30",
    status: "active",
    phone: "+7 918 445-12-09",
  },
  {
    client: "Игорь В.",
    initials: "ИВ",
    scooter: "Tank #04",
    when: "просрочен 2 дн",
    status: "late",
    phone: "+7 962 377-89-01",
  },
  {
    client: "Ольга П.",
    initials: "ОП",
    scooter: "Jog #23",
    when: "просрочен 4 ч",
    status: "late",
    phone: "+7 905 129-64-55",
  },
  {
    client: "Денис М.",
    initials: "ДМ",
    scooter: "Gear #11",
    when: "завтра 12:00",
    status: "soon",
    phone: "+7 961 200-41-18",
  },
  {
    client: "Елена Т.",
    initials: "ЕТ",
    scooter: "Jog #02",
    when: "завтра 19:00",
    status: "soon",
    phone: "+7 988 700-08-40",
  },
  {
    client: "Николай З.",
    initials: "НЗ",
    scooter: "Jog #18",
    when: "ср · 15 окт",
    status: "soon",
    phone: "+7 909 811-22-07",
  },
];

export const mockOverdue: OverdueItem[] = [
  {
    client: "Игорь В.",
    initials: "ИВ",
    scooter: "Tank #04",
    debt: "4 400 ₽",
    days: 4,
    phone: "+7 962 377-89-01",
  },
  {
    client: "Ольга П.",
    initials: "ОП",
    scooter: "Jog #23",
    debt: "1 800 ₽",
    days: 2,
    phone: "+7 905 129-64-55",
  },
  {
    client: "Руслан А.",
    initials: "РА",
    scooter: "Jog #31",
    debt: "1 200 ₽",
    days: 1,
    phone: "+7 919 442-80-12",
  },
];

export const mockTasks: TaskItem[] = [
  {
    icon: "wrench",
    title: "ТО Jog #07 после 3 000 км",
    meta: "просрочено · пт 10 окт",
    overdue: true,
  },
  {
    icon: "phone",
    title: "Позвонить Игорю — возврат Tank",
    meta: "просрочено · вс 12 окт",
    overdue: true,
  },
  {
    icon: "money",
    title: "Забрать платёж у Ольги (1 800 ₽)",
    meta: "сегодня до 18:00",
    overdue: false,
  },
  {
    icon: "doc",
    title: "Договор рассрочки · Руслан А.",
    meta: "сегодня · 14:00",
    overdue: false,
  },
  {
    icon: "bike",
    title: "Отдать Gear #11 Денису",
    meta: "сегодня · 16:30",
    overdue: false,
  },
  {
    icon: "box",
    title: "Заказать колодки на Jog (4 шт)",
    meta: "сегодня",
    overdue: false,
  },
  {
    icon: "money",
    title: "Сверка кассы за выходные",
    meta: "сегодня",
    overdue: false,
    done: true,
  },
];

export const mockActivity: ActivityItem[] = [
  {
    who: "Дима",
    initials: "Д",
    body: "принял возврат <b>Jog #05</b> от Алексея Р.",
    when: "8 мин назад",
  },
  {
    who: "Дима",
    initials: "Д",
    body: "оформил аренду <b>Jog #12</b> → Андрей К.",
    when: "22 мин назад",
  },
  {
    who: "Владимир",
    initials: "ВМ",
    body: "изменил рейтинг клиента <b>Игорь В.</b> 72 → 45",
    when: "1 ч назад",
  },
  {
    who: "Система",
    initials: "С",
    body: "авто-штраф <b>200 ₽</b> за просрочку (А-121)",
    when: "2 ч назад",
    system: true,
  },
  {
    who: "Дима",
    initials: "Д",
    body: "закрыл инцидент ДТП #17 (оплачено 6 000 ₽)",
    when: "вчера 19:40",
  },
];

export const mockRevenue: Record<RevenuePeriod, RevenueFrame> = {
  day: {
    value: "18 400",
    unit: "₽",
    delta: 12,
    vs: "vs вс 12 окт",
    chart: [45, 62, 58, 71, 49, 55, 88],
    labels: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  },
  week: {
    value: "142 600",
    unit: "₽",
    delta: 8,
    vs: "vs прошлой неделе",
    chart: [98, 102, 88, 115, 130, 95, 124],
    labels: ["W38", "W39", "W40", "W41", "W42", "W43", "W44"],
  },
  month: {
    value: "625 800",
    unit: "₽",
    delta: -3,
    vs: "vs сентябрю",
    chart: [82, 91, 78, 95, 88, 72, 65],
    labels: ["Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт"],
  },
};

export const returnStatusLabel: Record<ReturnStatus, string> = {
  active: "активна",
  late: "просрочка",
  soon: "скоро",
  done: "завершена",
};

export const scootStatusLabel: Record<ScootStatus, string> = {
  rented: "в аренде",
  overdue: "просрочка",
  free: "свободен",
  repair: "ремонт",
  sold: "продан",
  rassrochka: "рассрочка",
};
