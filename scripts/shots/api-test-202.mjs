/**
 * Проверка API выпуска 2.0.2 на превью (17.09): деньги ремонтов и смешанная
 * оплата аренды. Все строки — «ТЕСТ …», ремонт удаляется в конце; аренду и
 * клиента удаляют SQL-ом (purge доступен только создателю).
 *
 *   SHOTBOT_PASS=… node scripts/shots/api-test-202.mjs
 * Печатает id тестовых аренды и клиента для чистки.
 */
const API = process.env.SHOT_API ?? "https://api-preview.104-128-128-96.sslip.io";
const login = await fetch(API + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ login: "shotbot", password: process.env.SHOTBOT_PASS, remember: true }),
});
const cookie = /hulk_session=([^;]+)/.exec(login.headers.get("set-cookie") ?? "")?.[1];
if (!cookie) throw new Error("login failed " + login.status);

let fails = 0;
const ok = (cond, label, extra = "") => {
  console.log(`${cond ? "✓" : "✗"} ${label}${extra ? " — " + extra : ""}`);
  if (!cond) fails++;
};
async function call(method, url, body) {
  const r = await fetch(API + url, {
    method,
    headers: { Cookie: `hulk_session=${cookie}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = r.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await r.json() : await r.text();
  return { status: r.status, data, ct };
}
const T = (o) => o.totals;

/* ============ Ремонт ============ */
let r = await call("POST", "/api/service-orders", {
  customerName: "ТЕСТ API 202",
  vehicle: "Тест-скутер",
  items: [
    { kind: "work", name: "Диагностика", price: 1000 },
    { kind: "part", name: "Свеча", qty: 2, price: 500, cost: 300 },
  ],
  advance: { amount: 2500, method: "mixed", cashAmount: 1000 },
});
ok(r.status === 400 && r.data.error === "advance_too_big", "аванс больше суммы — отказ", r.data.message);

r = await call("POST", "/api/service-orders", {
  customerName: "ТЕСТ API 202",
  customerPhone: "+7 900 000-02-02",
  vehicle: "Тест-скутер",
  complaint: "проверка 2.0.2",
  items: [
    { kind: "work", name: "Диагностика", price: 1000 },
    { kind: "part", name: "Свеча", qty: 2, price: 500, cost: 300 },
  ],
  advance: { amount: 500, method: "mixed", cashAmount: 200 },
});
const o = r.data.order;
ok(r.status === 201 && o.status === "in_work", "создан сразу с позициями и авансом", `№${o?.number}`);
ok(T(o).due === 2000 && T(o).paid === 500 && T(o).left === 1500, "к оплате 2000 · внесено 500 · остаток 1500", JSON.stringify(T(o)));
ok(T(o).cost === 600 && T(o).profit === 1400, "закуп 600 · прибыль 1400");
ok(o.payments.length === 1 && o.payments[0].cashAmount === 200 && o.payments[0].transferAmount === 300, "аванс смешанно 200 + 300");
const id = o.id;
const work = o.items.find((i) => i.kind === "work");

r = await call("POST", `/api/service-orders/${id}/advance`, { amount: 1500, method: "cash" });
ok(r.status === 400, "аванс равный остатку — отказ", r.data.message);
r = await call("POST", `/api/service-orders/${id}/advance`, { amount: 1000, method: "cash" });
ok(r.status === 200 && T(r.data.order).left === 500 && T(r.data.order).paid === 1500, "второй аванс 1000 → остаток 500");

r = await call("PATCH", `/api/service-orders/items/${work.id}`, { price: 300 });
ok(T(r.data.order).overpaid === 200 && T(r.data.order).left === 0, "работа подешевела → переплата 200", JSON.stringify(T(r.data.order)));
r = await call("POST", `/api/service-orders/${id}/settle`, { method: "cash", discount: 0, expected: 0 });
ok(r.status === 409 && r.data.error === "overpaid", "расчёт при переплате — отказ");
r = await call("POST", `/api/service-orders/${id}/refund`, { amount: 300, method: "transfer" });
ok(r.status === 400, "вернуть больше переплаты — отказ");
r = await call("POST", `/api/service-orders/${id}/refund`, { amount: 200, method: "transfer" });
ok(r.status === 200 && T(r.data.order).overpaid === 0 && T(r.data.order).paid === 1300, "возврат 200 → внесено 1300");

r = await call("POST", `/api/service-orders/${id}/settle`, { method: "cash", discount: 0, expected: 0 });
ok(r.status === 200 && r.data.order.status === "paid", "всё внесено авансом → закрыт оплаченным (платёж 0)");
const zeroPay = r.data.paymentId;
r = await call("PATCH", `/api/service-orders/items/${work.id}`, { price: 1000 });
ok(r.status === 409 && r.data.error === "already_paid", "позиции оплаченного не меняются");
r = await call("POST", `/api/service-orders/${id}/cancel`, {});
ok(r.status === 409, "оплаченный не отменяется", r.data.message);
r = await call("DELETE", `/api/service-orders/payments/${zeroPay}`);
ok(r.status === 200 && r.data.order.status === "in_work", "отмена расчёта → снова в работе");

r = await call("PATCH", `/api/service-orders/items/${work.id}`, { price: 1000 });
ok(T(r.data.order).left === 700, "работа снова 1000 → остаток 700");
r = await call("POST", `/api/service-orders/${id}/settle`, { method: "transfer", discount: 0, expected: 5 });
ok(r.status === 409 && r.data.error === "total_changed", "устаревший остаток — отказ", r.data.message);
r = await call("POST", `/api/service-orders/${id}/settle`, { method: "transfer", discount: 200, expected: 700 });
const paidOrder = r.data.order;
ok(r.status === 200 && paidOrder.status === "paid" && paidOrder.discount === 200, "расчёт 500 со скидкой 200");
ok(T(paidOrder).due === 1800 && T(paidOrder).paid === 1800 && T(paidOrder).left === 0 && T(paidOrder).profit === 1200, "к оплате 1800 · внесено 1800 · прибыль 1200", JSON.stringify(T(paidOrder)));
ok(paidOrder.paymentMethod === "mixed" && paidOrder.cashAmount === 1200 && paidOrder.transferAmount === 600, "сводка: нал 1200 + перевод 600", `${paidOrder.paymentMethod} ${paidOrder.cashAmount}/${paidOrder.transferAmount}`);
const settlePay = r.data.paymentId;

r = await call("GET", `/api/service-orders/${id}/document`);
const html = String(r.data);
ok(r.status === 200 && /НАКЛАДНАЯ № \d{4}/.test(html), "накладная открывается");
ok(/Скидка/.test(html) && /Аванс/.test(html) && /Оплачено полностью/.test(html), "в накладной скидка, аванс, «оплачено полностью»");
ok(!/закуп|300 ₽ ×|себестоим/i.test(html), "закупа в накладной нет");
ok(/Одна тысяча восемьсот/.test(html), "сумма прописью");
r = await call("GET", `/api/service-orders/${id}/document?format=docx`);
ok(r.status === 200 && /msword/.test(r.ct), "накладная Word");

r = await call("DELETE", `/api/service-orders/payments/${settlePay}`);
ok(r.status === 200 && r.data.order.status === "in_work" && r.data.order.discount === 0, "отмена расчёта снимает скидку");
r = await call("POST", `/api/service-orders/${id}/cancel`, {});
ok(r.status === 200 && r.data.order.status === "cancelled" && T(r.data.order).paid === 0, "отмена ремонта → аванс вернули, внесено 0");
r = await call("PATCH", `/api/service-orders/items/${work.id}`, { price: 900 });
ok(r.status === 409, "у отменённого позиции не меняются");
r = await call("POST", `/api/service-orders/${id}/reopen`, { keepAdvance: true });
ok(r.status === 200 && r.data.order.status === "in_work" && T(r.data.order).paid === 1300, "возврат в работу — аванс у нас (1300)");
await call("POST", `/api/service-orders/${id}/complete`, {});
r = await call("POST", `/api/service-orders/${id}/cancel`, {});
ok(r.data.order.statusBeforeCancel === "done", "отменили готовый — помним статус");
r = await call("POST", `/api/service-orders/${id}/reopen`, { keepAdvance: false });
ok(r.data.order.status === "done" && T(r.data.order).paid === 0 && T(r.data.order).left === 2000, "возврат в работу — деньги забрали: снова «готов», остаток 2000", `${r.data.order.status} ${JSON.stringify(T(r.data.order))}`);
r = await call("POST", `/api/service-orders/${id}/complete`, {});
ok(r.status === 409, "«готов» повторно — отказ");

r = await call("PATCH", `/api/service-orders/${id}`, { customerName: "ТЕСТ API 202 (правка)", customerPhone: "+7 900 000-02-03" });
ok(r.status === 200 && r.data.order.customerPhone === "+7 900 000-02-03", "правка имени и телефона");

r = await call("POST", `/api/service-orders/${id}/pay`, { amount: 1500, method: "cash" });
ok(r.status === 200 && r.data.order.status === "paid" && r.data.order.discount === 500, "старый вызов /pay: меньше остатка = скидка 500");

r = await call("GET", `/api/activity?limit=200`);
const own = (r.data.items ?? []).filter((a) => a.entity === "service_order" && a.entityId === id);
const acts = own.map((a) => a.action);
ok(
  ["service_order_created", "service_order_advance", "service_order_item_updated", "service_order_refund", "service_order_paid", "service_order_payment_undone", "service_order_cancelled", "service_order_reopened", "service_order_updated"].every((a) => acts.includes(a)),
  "журнал: все действия записаны",
  [...new Set(acts)].join(", "),
);
const upd = own.find((a) => a.action === "service_order_updated");
ok(!!upd?.meta?.diff?.customerPhone, "журнал: телефон было → стало", upd?.summary);

r = await call("DELETE", `/api/service-orders/${id}`);
ok(r.status === 200, "тестовый ремонт удалён");

/* ============ Аренда: смешанная оплата ============ */
const cl = await call("POST", "/api/clients", { name: "ТЕСТ shotbot 202", phone: "+79000000202" });
ok(cl.status === 201 || cl.status === 200, "тестовый клиент", String(cl.data?.id ?? JSON.stringify(cl.data).slice(0, 120)));
const clientId = cl.data.id;
const scooterId = Number(process.env.TEST_SCOOTER_ID ?? 0);
const now = new Date();
const end = new Date(now.getTime() + 7 * 86400000);
const base = {
  clientId,
  scooterId,
  status: "active",
  tariffPeriod: "week",
  rate: 500,
  rateUnit: "day",
  deposit: 2000,
  startAt: now.toISOString(),
  endPlannedAt: end.toISOString(),
  days: 7,
  sum: 3500,
  paymentMethod: "cash",
  equipment: [],
  equipmentJson: [],
  note: "ТЕСТ 2.0.2 — удалить",
};
r = await call("POST", "/api/rentals", { ...base, paymentSplit: { cash: 1000, transfer: 2000 } });
ok(r.status === 400 && r.data.error === "split_mismatch", "доли не сходятся с суммой — отказ");
r = await call("POST", "/api/rentals", { ...base, paymentMethod: "transfer", paymentSplit: { cash: 1000, transfer: 2500 } });
ok(r.status === 201, "аренда со смешанной оплатой", r.status === 201 ? `#${r.data.id}` : JSON.stringify(r.data).slice(0, 200));
const rental = r.data;
ok(rental.paymentMethod === "transfer" && rental.paymentSplit?.cash === 1000, "способ аренды — по большей доле, доли сохранены");
let pays = (await call("GET", `/api/payments?rentalId=${rental.id}`)).data;
pays = (pays.items ?? pays).filter((p) => p.rentalId === rental.id);
ok(pays.length === 2 && pays.some((p) => p.method === "cash" && p.amount === 1000) && pays.some((p) => p.method === "transfer" && p.amount === 2500), "два платежа: нал 1000 + перевод 2500", pays.map((p) => `${p.method}:${p.amount}`).join(" "));
r = await call("GET", `/api/activity/timeline?entity=rental&id=${rental.id}&limit=20`);
const created = (r.data.items ?? r.data.events ?? []).find((a) => a.action === "created");
ok(created?.meta?.method === "mixed" && created?.meta?.split?.transfer === 2500, "журнал: способ «смешанно» с долями");

r = await call("PATCH", `/api/rentals/${rental.id}`, { sum: 700, days: 2, endPlannedAt: new Date(now.getTime() + 2 * 86400000).toISOString() });
pays = (await call("GET", `/api/payments?rentalId=${rental.id}`)).data;
pays = (pays.items ?? pays).filter((p) => p.rentalId === rental.id && p.type === "rent");
ok(pays.reduce((s, p) => s + p.amount, 0) === 700, "сумма аренды 700 → платежи в сумме 700", pays.map((p) => `${p.method}:${p.amount}`).join(" "));
r = await call("PATCH", `/api/rentals/${rental.id}`, { sum: 3500, days: 7, endPlannedAt: end.toISOString() });
pays = (await call("GET", `/api/payments?rentalId=${rental.id}`)).data;
pays = (pays.items ?? pays).filter((p) => p.rentalId === rental.id && p.type === "rent");
ok(pays.reduce((s, p) => s + p.amount, 0) === 3500, "обратно 3500 → платежи 3500", pays.map((p) => `${p.method}:${p.amount}`).join(" "));

const last = [...pays].sort((a, b) => b.id - a.id)[0];
r = await call("POST", `/api/rentals/${rental.id}/rollback-payment`, { paymentId: last.id });
ok(r.status === 200, "откат создания", JSON.stringify(r.data).slice(0, 160));
pays = (await call("GET", `/api/payments?rentalId=${rental.id}`)).data;
pays = (pays.items ?? pays).filter((p) => p.rentalId === rental.id);
ok(pays.length === 0, "откат снял оба платежа", `осталось ${pays.length}`);

console.log(`\nТЕСТ: аренда ${rental.id}, клиент ${clientId}`);
console.log(fails ? `ПРОВАЛОВ: ${fails}` : "ВСЁ ПРОШЛО");
process.exit(fails ? 1 : 0);
