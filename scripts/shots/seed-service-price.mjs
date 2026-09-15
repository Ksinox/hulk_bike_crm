/** Заводит прайс работ на preview (для проверки блока сторонних ремонтов). */
const API = "https://api-preview.104-128-128-96.sslip.io";
const r = await fetch(API + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ login: "shotbot", password: process.env.SHOTBOT_PASS, remember: true }),
});
const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
const H = { "Content-Type": "application/json", cookie };

const existing = await (await fetch(API + "/api/price-list?kind=service", { headers: H })).json();
if ((existing.groups ?? []).length > 0) {
  console.log("прайс работ уже есть:", existing.groups.map((g) => g.name).join(", "));
  process.exit(0);
}

const groups = [
  {
    name: "Двигатель",
    items: [
      ["Замена поршневой", 3500],
      ["Замена сальников", 1200],
      ["Чистка карбюратора", 900],
      ["Замена масла", 400],
    ],
  },
  {
    name: "Ходовая и трансмиссия",
    items: [
      ["Замена вариатора", 1500],
      ["Замена ремня", 700],
      ["Замена колодок", 600],
      ["Замена подшипников колеса", 1100],
    ],
  },
  {
    name: "Электрика",
    items: [
      ["Диагностика электрики", 500],
      ["Замена реле-регулятора", 800],
      ["Ремонт проводки", 1000],
    ],
  },
];

for (const g of groups) {
  const created = await (
    await fetch(API + "/api/price-list/groups", {
      method: "POST",
      headers: H,
      body: JSON.stringify({ name: g.name, kind: "service", priceALabel: "Цена работы" }),
    })
  ).json();
  const gid = created.id ?? created.group?.id;
  for (const [name, price] of g.items) {
    await fetch(API + "/api/price-list/items", {
      method: "POST",
      headers: H,
      body: JSON.stringify({ groupId: gid, name, priceA: price }),
    });
  }
  console.log("группа:", g.name, "id", gid, "позиций", g.items.length);
}
