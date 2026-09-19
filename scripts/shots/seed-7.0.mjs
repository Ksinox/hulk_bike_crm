/**
 * Правки 7.0 — тестовые данные на превью для кадров «было/стало».
 * Заводит модель «SEM» (только продажа — как у заказчика в проде) и одну
 * единицу «на продажу». Повторный запуск ничего не дублирует.
 *   SHOT_API=https://api-preview.104-128-128-96.sslip.io SHOTBOT_PASS=… node scripts/shots/seed-7.0.mjs
 */
const API = process.env.SHOT_API ?? "https://api-preview.104-128-128-96.sslip.io";
const login = await fetch(API + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ login: "shotbot", password: process.env.SHOTBOT_PASS, remember: true }),
});
const cookie = /hulk_session=([^;]+)/.exec(login.headers.get("set-cookie") ?? "")?.[1];
if (!cookie) throw new Error("вход shotbot не удался: " + login.status);
const call = async (method, url, body) => {
  const r = await fetch(API + url, {
    method,
    headers: { Cookie: `hulk_session=${cookie}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let data = t;
  try {
    data = JSON.parse(t);
  } catch {}
  return { status: r.status, data };
};

const me = await call("GET", "/api/auth/me");
console.log("shotbot:", me.data?.user?.role ?? me.data?.role);

const models = (await call("GET", "/api/scooter-models")).data.items;
let sem = models.find((m) => m.name === "SEM");
if (!sem) {
  const r = await call("POST", "/api/scooter-models", { name: "SEM", forRent: false, forSale: true, note: "ТЕСТ shotbot: правки 7.0, п.9" });
  console.log("модель SEM:", r.status);
  sem = r.data.item ?? r.data;
}
console.log("SEM id", sem.id);

const all = (await call("GET", "/api/scooters")).data.items ?? [];
if (!all.some((s) => s.modelId === sem.id && !s.archivedAt)) {
  const r = await call("POST", "/api/scooters", {
    name: "SEM ТЕСТ",
    model: "jog",
    modelId: sem.id,
    baseStatus: "for_sale",
    salePrice: 185000,
    note: "ТЕСТ shotbot: правки 7.0, п.9 — подпись модели",
  });
  console.log("скутер SEM:", r.status, r.data?.error ?? "", r.data?.message ?? "");
} else console.log("скутер SEM уже есть");

// Ремонт «Готов к выдаче» — для кадров замка и отката (п.10–11).
const orders = (await call("GET", "/api/service-orders")).data.orders ?? [];
let test = orders.find((o) => o.customerName === "ТЕСТ shotbot" && o.status !== "cancelled");
if (!test) {
  const r = await call("POST", "/api/service-orders", {
    customerName: "ТЕСТ shotbot",
    customerPhone: "+7 900 000-00-07",
    vehicle: "Honda Dio AF34 (ТЕСТ)",
    complaint: "Тест правок 7.0: замок готового ремонта и откат",
    items: [
      { kind: "work", name: "Замена ремня вариатора", qty: 1, price: 1500 },
      { kind: "part", name: "Ремень вариатора", qty: 1, price: 1200, cost: 700 },
    ],
  });
  test = r.data.order;
  console.log("ремонт ТЕСТ:", r.status, test?.number);
}
if (test && test.status === "in_work") {
  const r = await call("POST", `/api/service-orders/${test.id}/complete`, {});
  console.log("готов к выдаче:", r.status);
}
console.log("ремонт ТЕСТ №", test?.number, "id", test?.id);
