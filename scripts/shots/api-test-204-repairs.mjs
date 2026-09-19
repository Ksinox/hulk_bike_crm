/**
 * Правки 7.0 — ремонты: механики (п.2), замок готового ремонта (п.11) и
 * откат директором (п.10). Работает с тестовым ремонтом «ТЕСТ shotbot».
 *   SHOTBOT_PASS=… node scripts/shots/api-test-204-repairs.mjs
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
  let data = t;
  try {
    data = JSON.parse(t);
  } catch {}
  return { status: r.status, data };
};
ok(!!cookie, "вход shotbot");

// Механик
let mechs = (await call("GET", "/api/service-orders/mechanics")).data.mechanics;
let mech = mechs.find((m) => m.name === "ТЕСТ Механик shotbot");
if (!mech) {
  const r = await call("POST", "/api/service-orders/mechanics", { name: "ТЕСТ Механик shotbot", percent: 30 });
  ok(r.status === 201, "механик добавлен", String(r.status));
  mech = r.data.mechanic;
}
ok(mech.percent === 30, "у механика 30%", String(mech.percent));
const bad = await call("POST", "/api/service-orders/mechanics", { name: "", percent: 30 });
ok(bad.status === 400, "пустое имя — отказ", String(bad.status));
const bad2 = await call("POST", "/api/service-orders/mechanics", { name: "x", percent: 130 });
ok(bad2.status === 400, "процент > 100 — отказ", String(bad2.status));

// Готовый ремонт: замок
const orders = (await call("GET", "/api/service-orders")).data.orders;
let o = orders.find((x) => x.customerName === "ТЕСТ shotbot" && x.status !== "cancelled" && x.status !== "paid");
ok(!!o, "тестовый ремонт найден", o ? `№${o.number} ${o.status}` : "");
if (o.status === "in_work") o = (await call("POST", `/api/service-orders/${o.id}/complete`, {})).data.order;
ok(o.status === "done", "статус «готов к выдаче»");
let r = await call("PATCH", `/api/service-orders/${o.id}`, { complaint: "правка в готовом" });
ok(r.status === 409 && r.data.error === "ready_locked", "шапку готового не правят", `${r.status} ${r.data.error}`);
r = await call("POST", `/api/service-orders/${o.id}/items`, { kind: "work", name: "лишняя", price: 100 });
ok(r.status === 409 && r.data.error === "ready_locked", "позицию в готовый не добавить", `${r.status}`);
const itemId = o.items[0].id;
r = await call("PATCH", `/api/service-orders/items/${itemId}`, { price: 1 });
ok(r.status === 409, "цену позиции не поменять", `${r.status}`);
r = await call("DELETE", `/api/service-orders/items/${itemId}`);
ok(r.status === 409, "позицию не удалить", `${r.status}`);

// Откат
r = await call("POST", `/api/service-orders/${o.id}/uncomplete`, {});
ok(r.status === 200 && r.data.order.status === "in_work", "откат в «в работе»", `${r.status} ${r.data.order?.status}`);
ok(r.data.order.completedAt === null, "дата готовности снята");
r = await call("POST", `/api/service-orders/${o.id}/uncomplete`, {});
ok(r.status === 409, "повторный откат — отказ", `${r.status} ${r.data.message}`);

// Механик в наряде
r = await call("PATCH", `/api/service-orders/${o.id}`, { mechanicId: mech.id });
ok(r.status === 200, "механик назначен", String(r.status));
const t = r.data.order.totals;
ok(r.data.order.mechanicPercent === 30 && r.data.order.mechanicName === mech.name, "процент и имя в наряде");
const expShare = Math.round(Math.max(0, t.profit) * 0.3);
ok(t.mechanicShare === expShare && t.ourProfit === t.profit - expShare, "доля механика и наша прибыль", `прибыль ${t.profit}, механику ${t.mechanicShare}, нам ${t.ourProfit}`);
r = await call("PATCH", `/api/service-orders/${o.id}`, { mechanicId: 999999 });
ok(r.status === 400, "несуществующий механик — отказ", String(r.status));

// Снова готов
r = await call("POST", `/api/service-orders/${o.id}/complete`, {});
ok(r.data.order.status === "done", "снова «готов к выдаче»");

// Журнал
const j = await call("GET", `/api/activity?entity=service_order&entityId=${o.id}&limit=10`);
const acts = (j.data.items ?? []).map((x) => x.action);
ok(acts.includes("service_order_uncompleted"), "откат в журнале", acts.slice(0, 5).join(", "));

console.log(fails ? `\n✗ провалов: ${fails}` : "\n✓ всё сходится");
process.exit(fails ? 1 : 0);
