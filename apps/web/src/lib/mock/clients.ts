export type ClientSource = "avito" | "repeat" | "ref" | "maps" | "other";

export type Client = {
  id: number;
  name: string;
  phone: string;
  rating: number;
  rents: number;
  debt: number;
  source: ClientSource;
  added: string;
  blacklisted?: boolean;
  comment?: string;
  // Опциональные «сырые» поля из API — нужны UI-форме редактирования
  // и карточке клиента, чтобы не показывать прочерки когда данные есть
  // в БД. Заполняются adaptClient'ом из ApiClient. Для legacy моков
  // остаются undefined.
  extraPhone?: string | null;
  birthDate?: string | null; // ISO YYYY-MM-DD
  passportSeries?: string | null;
  passportNumber?: string | null;
  passportIssuedOn?: string | null; // ISO YYYY-MM-DD
  passportIssuer?: string | null;
  passportDivisionCode?: string | null;
  passportRegistration?: string | null;
  isForeigner?: boolean;
  passportRaw?: string | null;
  blacklistReason?: string | null;
};

export type RentalStatus = "active" | "done" | "overdue";

export type Rental = {
  scooter: string;
  period: string;
  status: RentalStatus;
  sum: number;
  deposit: number;
  src: string;
  note?: string;
};

export type Instalment = {
  scooter: string;
  start: string;
  total: number;
  paid: number;
  left: number;
  next: string;
  status: string;
};

export type Incident = {
  type: string;
  date: string;
  damage: number;
  paid: number;
  left: number;
  status: string;
  note?: string;
};

export type RatingEventType = "plus" | "minus" | "manual";

export type RatingEntry = {
  date: string;
  event: string;
  delta: number;
  score: number;
  type: RatingEventType;
  note?: string;
};

export type DocFile = {
  name: string;
  date: string;
  kind: "img" | "pdf";
  thumb?: string;
} | null;

export type ClientDetails = {
  birth: string;
  regAddr: string;
  liveAddr: string;
  passport: {
    ser: string;
    num: string;
    issuer: string;
    date: string;
    code: string;
  };
  docs: {
    passport_main: DocFile;
    passport_reg: DocFile;
    license: DocFile;
  };
  origVerified: { date: string; by: string } | null;
  blReason?: string | null;
  blDate?: string | null;
  blBy?: string | null;
  stats: { total: number; active: number; dtp: number };
  rentals: Rental[];
  instalments: Instalment[];
  incidents: Incident[];
  ratingHistory: RatingEntry[];
};

export const SOURCE_LABEL: Record<ClientSource, string> = {
  avito: "Авито",
  repeat: "повторный",
  ref: "рекомендация",
  maps: "карты",
  other: "другое",
};

export const SOURCE_PILL: Record<ClientSource, string> = {
  avito: "blue",
  repeat: "green",
  ref: "purple",
  maps: "orange",
  other: "gray",
};

export const CLIENTS: Client[] = [
  { id: 1,  name: "Абдуллаев Руслан",    phone: "+7 (964) 123-45-67", rating: 82, rents: 2, debt: 0,     source: "avito",  added: "03.04.26" },
  { id: 2,  name: "Белов Максим",        phone: "+7 (916) 234-56-78", rating: 91, rents: 1, debt: 0,     source: "ref",    added: "05.04.26", comment: "друг Антона" },
  { id: 3,  name: "Волкова Анна",        phone: "+7 (926) 345-67-89", rating: 28, rents: 0, debt: 8400,  source: "avito",  added: "08.04.26", comment: "звонить после 18" },
  { id: 4,  name: "Гусев Дмитрий",       phone: "+7 (903) 456-78-90", rating: 75, rents: 1, debt: 0,     source: "maps",   added: "10.04.26" },
  { id: 5,  name: "Данилов Никита",      phone: "+7 (925) 567-89-01", rating: 15, rents: 0, debt: 14200, source: "avito",  added: "11.04.26", blacklisted: true, comment: "не выходит на связь" },
  { id: 6,  name: "Егорова Мария",       phone: "+7 (977) 678-90-12", rating: 88, rents: 2, debt: 0,     source: "repeat", added: "14.04.26", comment: "постоянный клиент" },
  { id: 7,  name: "Жуков Олег",          phone: "+7 (906) 789-01-23", rating: 65, rents: 0, debt: 0,     source: "avito",  added: "16.04.26" },
  { id: 8,  name: "Зайцев Антон",        phone: "+7 (915) 890-12-34", rating: 94, rents: 1, debt: 0,     source: "ref",    added: "17.04.26" },
  { id: 9,  name: "Иванова Елена",       phone: "+7 (985) 901-23-45", rating: 72, rents: 1, debt: 0,     source: "avito",  added: "18.04.26" },
  { id: 10, name: "Кузнецов Сергей",     phone: "+7 (963) 012-34-56", rating: 35, rents: 0, debt: 3200,  source: "other",  added: "20.04.26", comment: "обещал вернуть до 25.04" },
  { id: 11, name: "Лапин Виктор",        phone: "+7 (917) 123-45-78", rating: 80, rents: 1, debt: 0,     source: "repeat", added: "22.04.26" },
  { id: 12, name: "Макаров Илья",        phone: "+7 (999) 234-56-89", rating: 22, rents: 0, debt: 0,     source: "avito",  added: "24.04.26", blacklisted: true, comment: "повредил скутер #12, не платил" },
  { id: 13, name: "Новикова Ольга",      phone: "+7 (965) 345-67-90", rating: 86, rents: 0, debt: 0,     source: "maps",   added: "26.04.26" },
  { id: 14, name: "Орлов Павел",         phone: "+7 (901) 456-78-01", rating: 70, rents: 1, debt: 0,     source: "ref",    added: "28.04.26" },
  { id: 15, name: "Петрова Ирина",       phone: "+7 (919) 567-89-12", rating: 68, rents: 0, debt: 0,     source: "avito",  added: "01.05.26" },
  { id: 16, name: "Рубцов Кирилл",       phone: "+7 (968) 678-90-23", rating: 45, rents: 0, debt: 5600,  source: "avito",  added: "03.05.26", comment: "ждёт зарплату" },
  { id: 17, name: "Соколова Татьяна",    phone: "+7 (929) 789-01-34", rating: 92, rents: 2, debt: 0,     source: "repeat", added: "05.05.26", comment: "VIP" },
  { id: 18, name: "Тимофеев Андрей",     phone: "+7 (910) 890-12-45", rating: 60, rents: 0, debt: 0,     source: "other",  added: "07.05.26" },
  { id: 19, name: "Ульянов Борис",       phone: "+7 (926) 901-23-56", rating: 84, rents: 1, debt: 0,     source: "avito",  added: "09.05.26" },
  { id: 20, name: "Фролов Михаил",       phone: "+7 (967) 012-34-67", rating: 55, rents: 0, debt: 0,     source: "maps",   added: "11.05.26" },
  { id: 21, name: "Харитонов Николай",   phone: "+7 (977) 123-45-89", rating: 38, rents: 0, debt: 2100,  source: "avito",  added: "13.05.26", comment: "пропустил 1 платёж" },
  { id: 22, name: "Цветкова Юлия",       phone: "+7 (903) 234-56-91", rating: 77, rents: 1, debt: 0,     source: "ref",    added: "15.05.26" },
  { id: 23, name: "Чернов Роман",        phone: "+7 (964) 345-67-02", rating: 18, rents: 0, debt: 19800, source: "other",  added: "17.05.26", blacklisted: true, comment: "исчез после аванса" },
  { id: 24, name: "Шульц Артём",         phone: "+7 (925) 456-78-13", rating: 74, rents: 1, debt: 0,     source: "repeat", added: "19.05.26" },
  { id: 25, name: "Щербаков Глеб",       phone: "+7 (916) 567-89-24", rating: 62, rents: 0, debt: 0,     source: "avito",  added: "21.05.26" },
  { id: 26, name: "Юдина Вера",          phone: "+7 (906) 678-90-35", rating: 95, rents: 2, debt: 0,     source: "ref",    added: "23.05.26", comment: "чемпионка по картингу" },
  { id: 27, name: "Ясин Артур",          phone: "+7 (917) 789-01-46", rating: 50, rents: 0, debt: 0,     source: "avito",  added: "25.05.26" },
  { id: 28, name: "Аксёнов Виталий",     phone: "+7 (985) 890-12-57", rating: 32, rents: 0, debt: 4500,  source: "avito",  added: "27.05.26" },
  { id: 29, name: "Бирюков Степан",      phone: "+7 (963) 901-23-68", rating: 81, rents: 1, debt: 0,     source: "maps",   added: "29.05.26" },
  { id: 30, name: "Валиев Тимур",        phone: "+7 (999) 012-34-79", rating: 25, rents: 0, debt: 11500, source: "avito",  added: "01.06.26", blacklisted: true, comment: "судится за депозит" },
  { id: 31, name: "Герасимова Алла",     phone: "+7 (915) 123-45-80", rating: 78, rents: 1, debt: 0,     source: "ref",    added: "03.06.26" },
  { id: 32, name: "Доронин Леонид",      phone: "+7 (977) 234-56-01", rating: 66, rents: 0, debt: 0,     source: "repeat", added: "05.06.26" },
  { id: 33, name: "Ефимов Владислав",    phone: "+7 (968) 345-67-12", rating: 42, rents: 0, debt: 1800,  source: "avito",  added: "07.06.26", comment: "должен до пт" },
  { id: 34, name: "Золотарёва Светлана", phone: "+7 (926) 456-78-23", rating: 89, rents: 2, debt: 0,     source: "repeat", added: "09.06.26", comment: "дочь катает" },
  { id: 35, name: "Исаков Константин",   phone: "+7 (903) 567-89-34", rating: 58, rents: 0, debt: 0,     source: "maps",   added: "11.06.26" },
  { id: 36, name: "Колесников Евгений",  phone: "+7 (925) 678-90-45", rating: 73, rents: 1, debt: 0,     source: "avito",  added: "13.06.26" },
  { id: 37, name: "Лаврентьев Игорь",    phone: "+7 (910) 789-01-56", rating: 48, rents: 0, debt: 0,     source: "other",  added: "15.06.26" },
  { id: 38, name: "Мельник Яков",        phone: "+7 (919) 890-12-67", rating: 83, rents: 1, debt: 0,     source: "ref",    added: "17.06.26" },
  { id: 39, name: "Никонов Денис",       phone: "+7 (964) 901-23-78", rating: 30, rents: 0, debt: 6900,  source: "avito",  added: "19.06.26", comment: "ссылается на жену" },
  { id: 40, name: "Осипова Дарья",       phone: "+7 (965) 012-34-89", rating: 87, rents: 1, debt: 0,     source: "repeat", added: "21.06.26" },
  { id: 41, name: "Потапов Григорий",    phone: "+7 (906) 123-45-00", rating: 52, rents: 0, debt: 0,     source: "avito",  added: "23.06.26" },
  { id: 42, name: "Романов Фёдор",       phone: "+7 (917) 234-56-11", rating: 71, rents: 1, debt: 0,     source: "maps",   added: "25.06.26" },
  { id: 43, name: "Савельев Арсений",    phone: "+7 (985) 345-67-22", rating: 90, rents: 0, debt: 0,     source: "ref",    added: "27.06.26" },
  { id: 44, name: "Токарев Вадим",       phone: "+7 (999) 456-78-33", rating: 68, rents: 0, debt: 0,     source: "avito",  added: "29.06.26" },
];

const RICH: Record<number, ClientDetails> = {
  17: {
    birth: "08.11.1985",
    regAddr: "г. Москва, ул. Тверская, д. 18, кв. 42",
    liveAddr: "совпадает с регистрацией",
    passport: { ser: "4509", num: "234 567", issuer: "ОВД Тверского района г. Москвы", date: "15.03.2010", code: "770-034" },
    docs: {
      passport_main: { name: "passport_sokolova_main.jpg", date: "05.05.2026", kind: "img", thumb: "СТ" },
      passport_reg: { name: "passport_sokolova_reg.jpg", date: "05.05.2026", kind: "img", thumb: "СТ" },
      license: { name: "license_sokolova.pdf", date: "05.05.2026", kind: "pdf" },
    },
    origVerified: { date: "05.05.2026", by: "Антон Р." },
    stats: { total: 12, active: 2, dtp: 0 },
    rentals: [
      { scooter: "Jog SA-36 #07", period: "14.09.2026 — идёт", status: "active", sum: 28000, deposit: 5000, src: "карта" },
      { scooter: "Honda Dio #03", period: "01.09.2026 — идёт", status: "active", sum: 18000, deposit: 3000, src: "карта" },
      { scooter: "Honda Tact #14", period: "05.08 — 28.08.2026", status: "done", sum: 14000, deposit: 3000, src: "нал" },
      { scooter: "Jog SA-39 #11", period: "10.07 — 25.07.2026", status: "done", sum: 9000, deposit: 3000, src: "карта" },
      { scooter: "Honda Dio #03", period: "15.06 — 25.06.2026", status: "done", sum: 7500, deposit: 3000, src: "карта" },
      { scooter: "Jog SA-36 #07", period: "20.05 — 10.06.2026", status: "done", sum: 13000, deposit: 3000, src: "карта" },
    ],
    instalments: [],
    incidents: [],
    ratingHistory: [
      { date: "10.09.2026", event: "Возврат вовремя", delta: 2, score: 92, type: "plus" },
      { date: "28.08.2026", event: "Возврат вовремя", delta: 2, score: 90, type: "plus" },
      { date: "05.08.2026", event: "2-я аренда за мес.", delta: 3, score: 88, type: "plus" },
      { date: "25.07.2026", event: "Возврат вовремя", delta: 2, score: 85, type: "plus" },
      { date: "25.06.2026", event: "Возврат вовремя", delta: 2, score: 83, type: "plus" },
      { date: "10.06.2026", event: "Ручная корр. директора", delta: 5, score: 81, type: "manual", note: "Привела двух друзей, оба оформили аренду" },
      { date: "25.05.2026", event: "Досрочная оплата", delta: 1, score: 76, type: "plus" },
    ],
  },
  10: {
    birth: "22.07.1993",
    regAddr: "Московская обл., г. Мытищи, ул. Семашко, д. 12, кв. 8",
    liveAddr: "г. Москва, ул. Краснопрудная, д. 5, кв. 14",
    passport: { ser: "4612", num: "789 012", issuer: "ОВД Мытищинского района", date: "10.08.2013", code: "500-054" },
    docs: {
      passport_main: { name: "passport_kuznetsov.jpg", date: "20.04.2026", kind: "img", thumb: "КС" },
      passport_reg: { name: "passport_kuznetsov_reg.jpg", date: "20.04.2026", kind: "img", thumb: "КС" },
      license: null,
    },
    origVerified: { date: "20.04.2026", by: "Антон Р." },
    stats: { total: 3, active: 0, dtp: 0 },
    rentals: [
      { scooter: "Jog SA-36 #12", period: "10.04 — 20.04.2026", status: "overdue", sum: 7800, deposit: 3000, src: "нал", note: "вернул на 3 дня позже" },
      { scooter: "Honda Dio #05", period: "05.03 — 12.03.2026", status: "done", sum: 5600, deposit: 3000, src: "нал" },
      { scooter: "Honda Tact #09", period: "10.02 — 15.02.2026", status: "done", sum: 4200, deposit: 3000, src: "карта" },
    ],
    instalments: [
      { scooter: "Honda Dio #05 (выкуп)", start: "12.03.2026", total: 85000, paid: 45000, left: 40000, next: "25.04.2026 · 5 000 ₽", status: "pending" },
    ],
    incidents: [
      { type: "Просрочка возврата", date: "20.04.2026", damage: 3200, paid: 0, left: 3200, status: "overdue", note: "штраф за 3 дня просрочки" },
    ],
    ratingHistory: [
      { date: "20.04.2026", event: "Просрочка 3 дня", delta: -15, score: 35, type: "minus" },
      { date: "12.03.2026", event: "Возврат вовремя", delta: 2, score: 50, type: "plus" },
      { date: "15.02.2026", event: "Возврат вовремя", delta: 2, score: 48, type: "plus" },
      { date: "10.02.2026", event: "Первая аренда", delta: 5, score: 46, type: "plus" },
      { date: "20.04.2026", event: "Начальный балл", delta: 0, score: 50, type: "plus" },
    ],
  },
  5: {
    birth: "14.02.2000",
    regAddr: "г. Москва, ул. Ленинский пр-т, д. 72, кв. 105",
    liveAddr: "совпадает с регистрацией",
    passport: { ser: "4520", num: "112 358", issuer: "ОВД района Теплый Стан г. Москвы", date: "20.02.2020", code: "770-101" },
    docs: {
      passport_main: { name: "passport_danilov.pdf", date: "11.04.2026", kind: "pdf" },
      passport_reg: null,
      license: { name: "license_danilov.jpg", date: "11.04.2026", kind: "img", thumb: "ДН" },
    },
    origVerified: null,
    blReason: "Не возвращает скутер #12 Jog с 15.04.2026, не отвечает на звонки. Сумма ущерба — 14 200 ₽.",
    blDate: "18.04.2026",
    blBy: "Директор И.",
    stats: { total: 1, active: 0, dtp: 1 },
    rentals: [
      { scooter: "Jog SA-36 #12", period: "11.04 — невозврат", status: "overdue", sum: 14200, deposit: 3000, src: "нал", note: "не вернул, заявлено в полицию" },
    ],
    instalments: [],
    incidents: [
      { type: "Невозврат скутера", date: "15.04.2026", damage: 45000, paid: 0, left: 45000, status: "overdue", note: "скутер не возвращён, заявление в ОВД" },
      { type: "Просрочка платежа", date: "12.04.2026", damage: 14200, paid: 0, left: 14200, status: "overdue", note: "аренда не оплачена" },
      { type: "ДТП", date: "13.04.2026", damage: 18000, paid: 0, left: 18000, status: "overdue", note: "повредил передний фонарь и крыло, свидетелей нет" },
    ],
    ratingHistory: [
      { date: "18.04.2026", event: "Занесён в чёрный список", delta: -30, score: 15, type: "manual", note: "Невозврат + ДТП + отсутствие связи. Решение директора." },
      { date: "15.04.2026", event: "Невозврат скутера", delta: -25, score: 45, type: "minus" },
      { date: "13.04.2026", event: "ДТП по вине клиента", delta: -15, score: 70, type: "minus" },
      { date: "11.04.2026", event: "Первая аренда", delta: 5, score: 85, type: "plus" },
    ],
  },
  15: {
    birth: "03.04.2001",
    regAddr: "г. Москва, ул. Дмитровское ш., д. 45, кв. 9",
    liveAddr: "совпадает с регистрацией",
    passport: { ser: "4522", num: "456 789", issuer: "ОВД Бескудниковского района г. Москвы", date: "03.04.2021", code: "770-089" },
    docs: {
      passport_main: { name: "passport_petrova.jpg", date: "01.05.2026", kind: "img", thumb: "ПИ" },
      passport_reg: null,
      license: null,
    },
    origVerified: null,
    stats: { total: 0, active: 0, dtp: 0 },
    rentals: [],
    instalments: [],
    incidents: [],
    ratingHistory: [
      { date: "01.05.2026", event: "Добавлена в систему", delta: 0, score: 68, type: "plus", note: "начальный балл новых клиентов" },
    ],
  },
};

/** "2003-10-11" → "11.10.2003"; пустое/невалидное → "—" */
function isoDateToRuFull(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function orDash(v: string | null | undefined): string {
  if (v == null) return "—";
  const t = String(v).trim();
  return t === "" ? "—" : t;
}

export function getClientDetails(c: Client): ClientDetails {
  if (RICH[c.id]) return RICH[c.id];

  const scooters = ["Jog SA-36 #07", "Honda Dio #03", "Honda Tact #14"];
  const rentals: Rental[] = [];
  for (let i = 0; i < c.rents; i++) {
    rentals.push({
      scooter: scooters[i % scooters.length],
      period: "02.09 — идёт",
      status: "active",
      sum: 8000 + i * 500,
      deposit: 3000,
      src: "карта",
    });
  }
  const incidents: Incident[] = c.debt
    ? [
        {
          type: "Просрочка",
          date: c.added,
          damage: c.debt,
          paid: 0,
          left: c.debt,
          status: "overdue",
          note: c.comment || "долг по последней аренде",
        },
      ]
    : [];

  // Если клиент пришёл из API (adaptClient проставил поля) — возвращаем
  // реальные данные. Иначе (legacy mock) — прочерки как раньше.
  return {
    birth: isoDateToRuFull(c.birthDate),
    regAddr: orDash(c.passportRegistration),
    liveAddr: orDash(c.passportRegistration),
    passport: {
      ser: orDash(c.passportSeries),
      num: orDash(c.passportNumber),
      issuer: orDash(c.passportIssuer),
      date: isoDateToRuFull(c.passportIssuedOn),
      code: orDash(c.passportDivisionCode),
    },
    docs: { passport_main: null, passport_reg: null, license: null },
    origVerified: null,
    blReason: c.blacklisted
      ? c.blacklistReason || c.comment || "Причина не указана"
      : null,
    blDate: c.blacklisted ? c.added : null,
    blBy: c.blacklisted ? "Директор" : null,
    stats: { total: c.rents, active: c.rents, dtp: 0 },
    rentals,
    instalments: [],
    incidents,
    ratingHistory: [
      { date: c.added, event: "Добавлен в систему", delta: 0, score: c.rating, type: "plus" },
    ],
  };
}

export function ratingTier(r: number): { label: string; tone: "good" | "mid" | "bad" } {
  if (r >= 80) return { label: "Надёжный", tone: "good" };
  if (r >= 50) return { label: "Средний", tone: "mid" };
  return { label: "Рискованный", tone: "bad" };
}

export function initialsOf(name: string): string {
  const parts = name.split(" ");
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function avatarColorIndex(id: number): number {
  return ((id - 1) % 6) + 1;
}

export function guessGender(name: string): "male" | "female" {
  const surname = name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (/(а|я|ая|ова|ева|ина|ская|цкая)$/.test(surname)) return "female";
  return "male";
}
