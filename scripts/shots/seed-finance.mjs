/**
 * Демо-наполнение блока «Финансы» на превью.
 *
 * Цифры — из рабочего Excel заказчика (листы «Выручка» и «Расходы»), чтобы
 * блок можно было смотреть на знакомых числах, а не на абстрактных.
 * Заполняем текущий период и два предыдущих — тогда видна динамика.
 *
 *   SHOTBOT_PASS=… node scripts/shots/seed-finance.mjs
 */
const API = process.env.SHOT_API ?? "https://api-preview.104-128-128-96.sslip.io";
const login = await fetch(API + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ login: "shotbot", password: process.env.SHOTBOT_PASS, remember: true }),
});
const cookie = /hulk_session=([^;]+)/.exec(login.headers.get("set-cookie") ?? "")?.[1];
const call = async (m, u, b) => {
  const r = await fetch(API + u, {
    method: m,
    headers: { Cookie: `hulk_session=${cookie}`, ...(b ? { "Content-Type": "application/json" } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });
  const t = await r.text();
  let d = t;
  try { d = JSON.parse(t); } catch {}
  return { status: r.status, data: d };
};

const cats = (await call("GET", "/api/finance/categories")).data.items;
const byName = (n) => cats.find((c) => c.name === n)?.id ?? null;

const cur = (await call("GET", "/api/finance/entries")).data;
const periods = cur.periods.slice(0, 3); // текущий и два прошлых
const boundsOf = async (key) => (await call("GET", `/api/finance/entries?period=${key}`)).data.bounds;

/** Приход и разовые расходы по периодам: свежий месяц — первый. */
const PLAN = [
  {
    income: [
      ["Аренда", "Выручка аренды", 633030],
      ["Ремонты", "Ремонты чужой техники", 42500],
      ["Запчасти в розницу", "Запчасти в розницу", 7800],
    ],
    expense: [
      ["Закупка запчастей", "Закуп запчастей на склад", 48200],
      ["Расходники парка", "Масло, ремни, свечи", 21400],
    ],
  },
  {
    income: [
      ["Аренда", "Выручка аренды", 566750],
      ["Ремонты", "Ремонты чужой техники", 61100],
      ["Запчасти в розницу", "Запчасти в розницу", 11400],
    ],
    expense: [
      ["Закупка запчастей", "Закуп запчастей на склад", 63900],
      ["Расходники парка", "Масло, ремни, свечи", 18900],
      ["Закуп техники", "Два скутера с привоза", 210000],
    ],
  },
  {
    income: [
      ["Аренда", "Выручка аренды", 471200],
      ["Ремонты", "Ремонты чужой техники", 30800],
    ],
    expense: [
      ["Закупка запчастей", "Закуп запчастей на склад", 39500],
      ["Расходники парка", "Химия и крепёж", 12300],
    ],
  },
];

for (let i = 0; i < periods.length; i++) {
  const key = periods[i];
  const b = await boundsOf(key);
  const plan = PLAN[i];
  if (!plan) continue;
  const day = (n) => {
    const d = new Date(b.from);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  let n = 2;
  for (const [cat, name, amount] of plan.income) {
    const r = await call("POST", "/api/finance/entries", {
      kind: "income",
      categoryId: byName(cat),
      name,
      amount,
      at: day(n),
    });
    if (r.status !== 201) console.log("!", name, r.status, JSON.stringify(r.data).slice(0, 120));
    n += 3;
  }
  for (const [cat, name, amount] of plan.expense) {
    await call("POST", "/api/finance/entries", {
      kind: "expense",
      categoryId: byName(cat),
      name,
      amount,
      at: day(n),
    });
    n += 2;
  }
  console.log("период", key, "заполнен");
}

/* Постоянные издержки — из листа «Расходы». */
const FIXED = [
  ["Аренда помещения", "Аренда помещения", 50000],
  ["Логистика", "Логистика", 20000],
  ["Реклама (Авито)", "Авито — реклама", 5200],
  ["Коммунальные", "Коммунальные платежи", 8000],
  ["Связь и интернет", "Интернет и связь", 1000],
];
const existing = (await call("GET", "/api/finance/recurring")).data.items;
for (const [cat, name, amount] of FIXED) {
  if (existing.some((e) => e.name === name)) continue;
  const r = await call("POST", "/api/finance/recurring", {
    categoryId: byName(cat),
    name,
    amount,
    startPeriod: periods[periods.length - 1],
  });
  console.log("постоянная:", name, r.status);
}

/* ФОТ: оклад + процент с продаж. */
const people = (await call("GET", "/api/finance/people")).data.items;
const PEOPLE = [
  ["Дима", "администратор", 80000, 11000],
  ["Кирилл", "механик", 70000, 14500],
];
for (const [name, role, salary, bonus] of PEOPLE) {
  let p = people.find((x) => x.name === name);
  if (!p) {
    const r = await call("POST", "/api/finance/people", { name, role, salaryDefault: salary });
    p = r.data.item;
    console.log("человек:", name, r.status);
  }
  const payroll = (await call("GET", `/api/finance/payroll?period=${periods[0]}`)).data.items;
  const row = payroll.find((x) => x.personId === p.id);
  if (row) await call("PATCH", `/api/finance/payroll/${row.id}`, { salary, salesBonus: bonus });
}

const after = (await call("GET", "/api/finance/entries")).data.items;
console.log("движений всего:", after.length);
