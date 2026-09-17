/**
 * Прайс запчастей 2.0.2 на превью: каталог, выбор из прайса, своя позиция →
 * прайс без дублей. Тестовые строки «ТЕСТ …» удаляются в конце.
 *   SHOTBOT_PASS=… node scripts/shots/api-test-202-parts.mjs
 */
const API = process.env.SHOT_API ?? "https://api-preview.104-128-128-96.sslip.io";
const login = await fetch(API + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ login: "shotbot", password: process.env.SHOTBOT_PASS, remember: true }),
});
const cookie = /hulk_session=([^;]+)/.exec(login.headers.get("set-cookie") ?? "")?.[1];
let fails = 0;
const ok = (c, label, extra = "") => {
  console.log(`${c ? "✓" : "✗"} ${label}${extra ? " — " + extra : ""}`);
  if (!c) fails++;
};
const call = async (method, url, body) => {
  const r = await fetch(API + url, {
    method,
    headers: { Cookie: `hulk_session=${cookie}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let data = null;
  try {
    data = JSON.parse(t);
  } catch {
    data = t;
  }
  return { status: r.status, data };
};

let r = await call("GET", "/api/price-list?kind=part");
const groups = r.data.groups;
const all = groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.name })));
ok(all.length >= 766, "прайс запчастей заполнен", `${all.length} позиций в ${groups.length} группах`);
ok(groups.every((g) => g.name.includes(" · ") || g.name === "Добавлено из ремонтов"), "группы «Зона · Узел»");
const belt = all.find((i) => i.code?.startsWith("TRANS-CVT-01-") && i.name.includes("810×17,5"));
ok(belt && belt.name.includes("810×17,5") && belt.cost === 890 && belt.priceA === 1250, "ремень Gear: закуп 890, цена 1250", JSON.stringify(belt && { name: belt.name, cost: belt.cost, price: belt.priceA, img: belt.imageKey }));
ok(all.filter((i) => i.imageKey === "front-cover").length === 5, "облицовка передняя — 5 моделей, одна картинка");
r = await call("GET", "/api/price-list?kind=service");
ok(r.data.groups.flatMap((g) => g.items).length >= 104, "прайс работ заполнен", `${r.data.groups.flatMap((g) => g.items).length} работ`);

// Ремонт: из прайса, своя запчасть, своя работа
r = await call("POST", "/api/service-orders", {
  customerName: "ТЕСТ прайс 202",
  vehicle: "Yamaha Gear",
  items: [
    { kind: "part", name: belt.name, priceItemId: belt.id },
    { kind: "part", name: "ТЕСТ Втулка редкая", price: 700, cost: 400, saveToPrice: true },
    { kind: "work", name: "ТЕСТ Работа редкая", price: 900, saveToPrice: true },
  ],
});
const order = r.data.order;
ok(r.status === 201, "ремонт создан", `№${order?.number}`);
const beltRow = order.items.find((i) => i.name === belt.name);
ok(beltRow?.price === 1250 && beltRow?.cost === 890 && beltRow?.priceItemId === belt.id, "из прайса: цена 1250 и закуп 890 подставились");
ok((r.data.savedToPrice ?? []).length === 2, "свои позиции сохранены в прайс", JSON.stringify(r.data.savedToPrice));
const ownPart = order.items.find((i) => i.name === "ТЕСТ Втулка редкая");
ok(ownPart?.priceItemId != null, "своя запчасть привязана к новой позиции прайса");

r = await call("POST", `/api/service-orders/${order.id}/items`, { kind: "part", name: "тест втулка РЕДКАЯ", price: 800, cost: 450, saveToPrice: true });
ok(r.status === 201 && (r.data.savedToPrice ?? []).length === 0, "та же запчасть другим регистром — не задвоилась");
ok(r.data.item.priceItemId === ownPart.priceItemId, "и привязалась к той же позиции прайса");

r = await call("GET", "/api/price-list?kind=part");
const inbox = r.data.groups.find((g) => g.name === "Добавлено из ремонтов");
const saved = inbox?.items.find((i) => i.name === "ТЕСТ Втулка редкая");
ok(saved?.priceA === 700 && saved?.cost === 400, "в «Добавлено из ремонтов»: цена 700, закуп 400");
r = await call("GET", "/api/price-list?kind=service");
const inboxW = r.data.groups.find((g) => g.name === "Добавлено из ремонтов");
const savedW = inboxW?.items.find((i) => i.name === "ТЕСТ Работа редкая");
ok(savedW?.priceA === 900, "работа — в «Добавлено из ремонтов» прайса работ");

r = await call("GET", "/api/activity?limit=50");
ok((r.data.items ?? []).some((a) => a.entity === "price_item" && /ТЕСТ Втулка редкая/.test(a.summary)), "журнал: «Прайс запчастей: добавлена …»");

// Уборка
await call("DELETE", `/api/service-orders/${order.id}`);
for (const it of [saved, savedW]) if (it) await call("DELETE", `/api/price-list/items/${it.id}`);
console.log(`\nТЕСТ: ремонт ${order.id}, группы-«входящие» ${inbox?.id}/${inboxW?.id}`);
console.log(fails ? `ПРОВАЛОВ: ${fails}` : "ВСЁ ПРОШЛО");
process.exit(fails ? 1 : 0);
