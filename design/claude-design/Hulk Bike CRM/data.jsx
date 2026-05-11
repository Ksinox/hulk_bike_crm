/* Mock data — mirrors apps/web/src/lib/mock/rentals.ts shape */

const TARIFF_LABEL = { short: 'до 2 дн', day: '3–6 дней', week: '7+ дней', month: '30+ дней' };

const EQUIPMENT_CATALOG = [
  { id: 1, name: 'Шлем',                  price: 0,   free: true,  group: 'Защита' },
  { id: 2, name: 'Шлем VIP',              price: 100, free: false, group: 'Защита' },
  { id: 3, name: 'Шлем-интеграл',         price: 150, free: false, group: 'Защита' },
  { id: 4, name: 'Перчатки',              price: 50,  free: false, group: 'Защита' },
  { id: 5, name: 'Наколенники',           price: 80,  free: false, group: 'Защита' },
  { id: 6, name: 'Дождевик',              price: 70,  free: false, group: 'Погода' },
  { id: 7, name: 'Чехол от дождя',        price: 40,  free: false, group: 'Погода' },
  { id: 8, name: 'Держатель телефона',    price: 0,   free: true,  group: 'Аксессуары' },
  { id: 9, name: 'Сумка-кофр',            price: 120, free: false, group: 'Аксессуары' },
  { id: 10, name: 'USB-зарядка',          price: 0,   free: true,  group: 'Аксессуары' },
  { id: 11, name: 'Замок-цепь',           price: 50,  free: false, group: 'Аксессуары' },
];

const PARK = [
  { id: 'jog-01', model: 'Yamaha Jog',   number: 'Jog #01',   mileage: 8700,  status: 'rented',    rate: 500, color: '#1e3a8a' },
  { id: 'jog-04', model: 'Yamaha Jog',   number: 'Jog #04',   mileage: 12400, status: 'available', rate: 500, color: '#7c3aed' },
  { id: 'jog-07', model: 'Yamaha Jog',   number: 'Jog #07',   mileage: 5200,  status: 'available', rate: 500, color: '#ef4444' },
  { id: 'jog-12', model: 'Yamaha Jog',   number: 'Jog #12',   mileage: 21800, status: 'service',   rate: 500, color: '#0ea5e9' },
  { id: 'gear-02', model: 'Honda Gear',  number: 'Gear #02',  mileage: 3100,  status: 'available', rate: 600, color: '#10b981' },
  { id: 'gear-05', model: 'Honda Gear',  number: 'Gear #05',  mileage: 9700,  status: 'available', rate: 600, color: '#f59e0b' },
  { id: 'dio-03', model: 'Honda Dio',    number: 'Dio #03',   mileage: 14200, status: 'available', rate: 450, color: '#64748b' },
];

const RENTAL_BASE = {
  id: 115,
  status: 'active',     // active | overdue
  client: {
    id: 12,
    name: 'Иванов Иван Иванович',
    initials: 'ИИ',
    rating: 68,
    phone: '+7 (993) 319-42-93',
    altPhone: '+7 (993) 319-42-93',
    dob: '22.02.1997',
    address: 'Краснодарский край, Усть-Лабинский район, ст. Ладожская, ул. Карнаухова 61',
    depositBalance: 1200,
    color: '#6366f1',
  },
  scooterId: 'jog-01',
  startDate: { y: 2026, m: 4, d: 1 },    // 01.05.2026 (month is 0-indexed)
  endDate:   { y: 2026, m: 4, d: 18 },   // 18.05.2026
  startTime: '19:46',
  endTime:   '19:46',
  warehouse: 'Склад "Северный"',
  tariff: { period: 'day', label: '3–6 дней', rate: 500 },
  paymentMethod: 'наличные',
  deposit: 2000,
  depositSource: 'НА БАЛАНСЕ КОМПАНИИ',
  equipment: [
    { itemId: 1, name: 'Шлем',               price: 0,   free: true },
    { itemId: 8, name: 'Держатель телефона', price: 0,   free: true },
    { itemId: 2, name: 'Шлем VIP',           price: 100, free: false },
  ],
  thisRentalSum: 4000,
  lifetimeSum: 8500,
  extensions: 2,
  depositOnFile: 5000,
  depositSpent: 3000,
  debt: 0,
  overdueDays: 0,
};

// Variant: overdue rental
const RENTAL_OVERDUE = {
  ...RENTAL_BASE,
  status: 'overdue',
  endDate: { y: 2026, m: 4, d: 8 },  // ended 8 May, today is 11 May → 3 days overdue
  debt: 1500,
  overdueDays: 3,
};

// today is anchored to 11.05.2026 to match `Current date is now May 11, 2026`
const TODAY = { y: 2026, m: 4, d: 11 };

// helpers
function dateKey(d) { return `${d.y}-${d.m}-${d.d}`; }
function toDate(d) { return new Date(d.y, d.m, d.d); }
function fromDate(dt) { return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() }; }
function addDays(d, n) {
  const dt = toDate(d); dt.setDate(dt.getDate() + n); return fromDate(dt);
}
function diffDays(a, b) {
  return Math.round((toDate(b) - toDate(a)) / 86400000);
}
function isSame(a, b) { return a.y === b.y && a.m === b.m && a.d === b.d; }
function fmtDDMM(d) { return `${String(d.d).padStart(2,'0')}.${String(d.m+1).padStart(2,'0')}`; }
function fmtDDMMYYYY(d) { return `${fmtDDMM(d)}.${d.y}`; }
function fmtMoney(n) { return n.toLocaleString('ru-RU'); }

/* Activity feed — one ledger for all rental events. Sorted newest first.
   Each event has `diff`: { field: { label, from, to, kind } } so the History
   drawer can reveal what actually changed on hover. `kind` controls how the
   diff renders: 'money' | 'date' | 'list' | 'text' | 'number'. */
const ACTIVITY = [
  { id: 16, ts: '11.05.2026 09:15', type: 'overdue',    amount: -500, bal: -1500, title: 'Просрочка начислена', sub: 'День 3 · 500 ₽/сут', who: 'Система', avatar: '⚙', revertible: false,
    diff: {
      debt: { label: 'Долг клиента', from: 1000, to: 1500, kind: 'money' },
      overdueDays: { label: 'Дней просрочки', from: 2, to: 3, kind: 'number' },
    }},
  { id: 15, ts: '10.05.2026 09:15', type: 'overdue',    amount: -500, bal: -1000, title: 'Просрочка начислена', sub: 'День 2 · 500 ₽/сут', who: 'Система', avatar: '⚙', revertible: false,
    diff: {
      debt: { label: 'Долг клиента', from: 500, to: 1000, kind: 'money' },
      overdueDays: { label: 'Дней просрочки', from: 1, to: 2, kind: 'number' },
    }},
  { id: 14, ts: '09.05.2026 09:15', type: 'overdue',    amount: -500, bal: -500, title: 'Просрочка начислена', sub: 'День 1 · 500 ₽/сут', who: 'Система', avatar: '⚙', revertible: false,
    diff: {
      debt: { label: 'Долг клиента', from: 0, to: 500, kind: 'money' },
      overdueDays: { label: 'Дней просрочки', from: 0, to: 1, kind: 'number' },
      status: { label: 'Статус аренды', from: 'Активна', to: 'Просрочка', kind: 'text' },
    }},
  { id: 13, ts: '07.05.2026 12:10', type: 'equipment',  amount: -300, bal: 0,    title: 'Замена экипировки', sub: 'Шлем → Шлем VIP · доплата за 3 дня', who: 'Артём Воронов', avatar: 'АВ', revertible: true,
    diff: {
      items: { label: 'Список экипировки', kind: 'list',
        from: ['Шлем', 'Держатель телефона'],
        to:   ['Шлем', 'Держатель телефона', 'Шлем VIP'] },
      equipRate: { label: 'Доплата за экипировку', from: 0, to: 100, kind: 'money' },
    }},
  { id: 12, ts: '05.05.2026 14:30', type: 'scooter',    amount: 0, bal: 0,    title: 'Замена скутера', sub: 'Заклинило сцепление · клиент пожаловался', who: 'Артём Воронов', avatar: 'АВ', revertible: true,
    diff: {
      scooter: { label: 'Скутер', from: 'Jog #04 · Yamaha Jog', to: 'Jog #01 · Yamaha Jog', kind: 'text' },
      mileage: { label: 'Пробег при замене', from: 12400, to: 8700, kind: 'number', suffix: 'км' },
    }},
  { id: 11, ts: '04.05.2026 19:46', type: 'extend',     amount: -3500, bal: 0, title: 'Продление на 7 дней', sub: 'Дотянули период мышкой на календаре', who: 'Артём Воронов', avatar: 'АВ', revertible: true,
    diff: {
      end:   { label: 'Дата возврата', from: '04.05.2026', to: '11.05.2026', kind: 'date' },
      days:  { label: 'Длительность аренды', from: 4, to: 11, kind: 'number', suffix: 'дн' },
      paid:  { label: 'Принято наличными', from: 0, to: 3500, kind: 'money' },
    }, linkedTo: 10 },
  { id: 10, ts: '04.05.2026 19:46', type: 'payment',    amount: 3500, bal: 0,  title: 'Оплата продления', sub: 'Наличные · в кассу', who: 'Артём Воронов', avatar: 'АВ', revertible: true,
    diff: {
      cash: { label: 'Касса (наличные)', from: 12300, to: 15800, kind: 'money' },
    }, linkedTo: 11 },
  { id: 9,  ts: '03.05.2026 09:14', type: 'deposit-up', amount: 2000, bal: 0,  title: 'Пополнение залога', sub: 'Перевод СБП', who: 'Артём Воронов', avatar: 'АВ', revertible: true,
    diff: {
      deposit: { label: 'Залог на руках', from: 3000, to: 5000, kind: 'money' },
    }},
  { id: 8,  ts: '02.05.2026 16:00', type: 'forgive',    amount: 500, bal: 0,   title: 'Прощён 1 день просрочки', sub: 'Опоздал на час · согласовано', who: 'Дарья Ким', avatar: 'ДК', revertible: true,
    diff: {
      debt: { label: 'Долг клиента', from: 500, to: 0, kind: 'money' },
      overdueDays: { label: 'Дней просрочки', from: 1, to: 0, kind: 'number' },
    }},
  { id: 7,  ts: '02.05.2026 11:20', type: 'tariff',     amount: 0, bal: 0,     title: 'Смена тарифа', sub: 'Перевели на «3–6 дней»', who: 'Дарья Ким', avatar: 'ДК', revertible: true,
    diff: {
      tariff: { label: 'Тариф', from: 'до 2 дней', to: '3–6 дней', kind: 'text' },
      rate:   { label: 'Ставка за сутки', from: 600, to: 500, kind: 'money' },
    }},
  { id: 6,  ts: '01.05.2026 19:46', type: 'extend',     amount: -2000, bal: 0, title: 'Старт аренды на 4 дня', sub: 'Аренда открыта', who: 'Артём Воронов', avatar: 'АВ', revertible: false,
    diff: {
      end:  { label: 'Дата возврата', from: '—', to: '05.05.2026', kind: 'date' },
      days: { label: 'Длительность', from: 0, to: 4, kind: 'number', suffix: 'дн' },
    }, linkedTo: 5 },
  { id: 5,  ts: '01.05.2026 19:46', type: 'payment',    amount: 2000, bal: 0,  title: 'Оплата аренды', sub: 'Наличные · в кассу', who: 'Артём Воронов', avatar: 'АВ', revertible: false,
    diff: { cash: { label: 'Касса (наличные)', from: 10300, to: 12300, kind: 'money' } }, linkedTo: 6 },
  { id: 4,  ts: '01.05.2026 19:45', type: 'deposit',    amount: 5000, bal: 0,  title: 'Залог принят', sub: '5 000 ₽ · наличные', who: 'Артём Воронов', avatar: 'АВ', revertible: false,
    diff: { deposit: { label: 'Залог на руках', from: 0, to: 5000, kind: 'money' } }},
  { id: 3,  ts: '01.05.2026 19:40', type: 'equipment',  amount: 0, bal: 0,     title: 'Выдана экипировка', sub: 'Шлем · Держатель телефона', who: 'Артём Воронов', avatar: 'АВ', revertible: false,
    diff: {
      items: { label: 'Список экипировки', kind: 'list',
        from: [],
        to:   ['Шлем', 'Держатель телефона'] },
    }},
  { id: 2,  ts: '01.05.2026 19:35', type: 'scooter',    amount: 0, bal: 0,     title: 'Скутер выдан', sub: 'Jog #04 · Yamaha Jog', who: 'Артём Воронов', avatar: 'АВ', revertible: false,
    diff: {
      scooter: { label: 'Назначен скутер', from: '—', to: 'Jog #04 · Yamaha Jog', kind: 'text' },
      mileage: { label: 'Пробег при выдаче', from: 12200, to: 12400, kind: 'number', suffix: 'км' },
    }},
  { id: 1,  ts: '01.05.2026 19:30', type: 'created',    amount: 0, bal: 0,     title: 'Аренда создана', sub: 'Тариф «до 2 дней» · 600 ₽/сут', who: 'Артём Воронов', avatar: 'АВ', revertible: false,
    diff: {
      status: { label: 'Статус', from: '—', to: 'Активна', kind: 'text' },
      tariff: { label: 'Тариф', from: '—', to: 'до 2 дней · 600 ₽', kind: 'text' },
    }},
];

/* Tasks for the Tasks drawer */
const TASKS = [
  { id: 1, title: 'Позвонить, напомнить про возврат', due: '11.05.2026', priority: 'high',   done: false, who: 'Артём Воронов' },
  { id: 2, title: 'Запросить вторую фотографию паспорта', due: '14.05.2026', priority: 'normal', done: false, who: 'Дарья Ким' },
  { id: 3, title: 'Уточнить адрес возврата (Ладожская)', due: '12.05.2026', priority: 'normal', done: false, who: 'Артём Воронов' },
  { id: 4, title: 'Заехать в сервис — проверить пробег', due: '10.05.2026', priority: 'low',    done: true,  who: 'Сервис' },
];

/* Documents for the Documents drawer */
const DOCS = [
  { id: 1, name: 'Договор аренды #0115', kind: 'pdf', size: '184 КБ', date: '01.05.2026' },
  { id: 2, name: 'Акт приёма-передачи',  kind: 'pdf', size: '92 КБ',  date: '01.05.2026' },
  { id: 3, name: 'Паспорт клиента',      kind: 'jpg', size: '1.4 МБ', date: '01.05.2026' },
  { id: 4, name: 'Фото пробега при выдаче', kind: 'jpg', size: '720 КБ', date: '01.05.2026' },
  { id: 5, name: 'Скриншот СБП-перевода (залог)', kind: 'jpg', size: '210 КБ', date: '03.05.2026' },
];

/* Debt periods for the Debts drawer */
const DEBT_PERIODS = [
  { id: 1, range: '09.05 — 11.05.2026', days: 3, amount: 1500, status: 'open',   note: 'Текущая просрочка'   },
  { id: 2, range: '02.05.2026',         days: 1, amount: 500,  status: 'forgiven', note: 'Прощено · опоздал'   },
  { id: 3, range: '16.04 — 17.04.2026', days: 2, amount: 1000, status: 'paid',   note: 'Закрыто продлением'  },
];

Object.assign(window, {
  TARIFF_LABEL, EQUIPMENT_CATALOG, PARK, RENTAL_BASE, RENTAL_OVERDUE, TODAY, ACTIVITY, TASKS, DOCS, DEBT_PERIODS,
  dateKey, toDate, fromDate, addDays, diffDays, isSame, fmtDDMM, fmtDDMMYYYY, fmtMoney,
});
