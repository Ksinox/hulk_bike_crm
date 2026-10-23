/**
 * Партия 23.10 — сквозная проверка денег «ущерб ↔ Должники ↔ аренда ↔ клиент».
 * Гоняется ТОЛЬКО на копии базы (песочница): создаёт акт, принимает оплаты.
 *
 *   API=http://localhost:4111 DB=postgres://…/hulk_sync_test \
 *   SB_LOGIN=sb_admin SB_PASS=… node scripts/shots/api-test-damage-debtors.mjs
 */
import postgres from "postgres";

const API = process.env.API ?? "http://localhost:4111";
const DB = process.env.DB;
if (!DB || !/sync_test|totp_test|sandbox/.test(DB)) throw new Error("только копия базы!");
const sql = postgres(DB, { max: 1 });

let cookie = "";
async function call(method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: body ? { "content-type": "application/json", cookie } : { cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}
let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log("  ✓", msg); }
  else { fail++; console.log("  ✗", msg, extra !== undefined ? JSON.stringify(extra) : ""); }
}
const caseOf = async (rentalId, reportId) => {
  const res = await call("GET", `/api/debtors/by-rentals?ids=${rentalId}`);
  if (!res.body?.items) throw new Error("by-rentals " + res.status + " " + JSON.stringify(res.body));
  return res.body.items.find((c) => Number(c.damageReportId) === reportId);
};
const detail = async (id) => (await call("GET", `/api/debtors/${id}`)).body;
const rentalDebt = async (rid) => (await call("GET", `/api/rentals/${rid}/debt`)).body;
const client = async (cid) => (await call("GET", `/api/clients/${cid}`)).body;

const login = await call("POST", "/api/auth/login", {
  login: process.env.SB_LOGIN ?? "sb_admin",
  password: process.env.SB_PASS,
});
if (login.status !== 200) throw new Error("login " + login.status);

// Активная аренда без актов и без открытых дел.
const [r] = await sql`
  select r.id, r.client_id, r.deposit from rentals r
  where r.status='active' and r.archived_at is null
    and not exists (select 1 from damage_reports d where d.rental_id=r.id)
    and not exists (select 1 from debtors x where x.client_id=r.client_id and x.stage::text not like 'closed_%')
  order by r.id desc limit 1`;
r.id = Number(r.id);
r.client_id = Number(r.client_id);
console.log("аренда", r.id, "клиент", r.client_id);
const before = await rentalDebt(r.id);
const clientBefore = await client(r.client_id);

console.log("\n1. Акт на 12 000 ₽, без залога, срок 7 дней");
const act = (await call("POST", "/api/damage-reports", {
  rentalId: r.id,
  depositCovered: 0,
  payDays: 7,
  items: [{ name: "ТЕСТ пластик", originalPrice: 12000, finalPrice: 12000, quantity: 1 }],
})).body;
ok(act?.id > 0, "акт создан", act);
let c = await caseOf(r.id, act.id);
ok(!!c, "дело ущерба заведено сразу при акте");
ok(c?.remaining === 12000, "остаток дела 12 000", c);
ok(!!c?.paymentDueDate, "срок «ждём оплату до» стоит", c?.paymentDueDate);
let rd = await rentalDebt(r.id);
ok(rd.overdueBalance === before.overdueBalance && rd.manualBalance === before.manualBalance,
  "долг аренды (просрочка/ручной) не изменился от ущерба");
ok((await client(r.client_id)).unpaidDamageDebt === (clientBefore.unpaidDamageDebt ?? 0) + 12000,
  "у клиента «долг по ущербу» +12 000");
const today = (await call("GET", "/api/debtors/today")).body;
ok(!today.queue.some((q) => q.debtor.id === c.id) && today.hottest?.debtor.id !== c.id,
  "дело, которое ждёт оплату, не в прозвоне");

console.log("\n2. Оплата 2 000 в карточке аренды (по акту)");
const p2 = await call("POST", `/api/damage-reports/${act.id}/payment`, { amount: 2000, method: "cash" });
ok(p2.status === 200 || p2.status === 201, "оплата по акту принята", p2.body);
let d = await detail(c.id);
ok(d.paid === 2000 && d.remaining === 10000, "дело: оплачено 2 000, осталось 10 000", { paid: d.paid, rem: d.remaining });
ok(d.payments.some((p) => p.paidAmount === 2000), "в деле строка платежа из аренды");

console.log("\n3. Срок прошёл → «Частично» 3 000, остаток через 3 дня");
await sql`update debtors set payment_due_date = current_date - 1 where id=${c.id}`;
const today2 = (await call("GET", "/api/debtors/today")).body;
const inCalls = [today2.hottest, ...today2.queue].find((q) => q?.debtor.id === c.id);
ok(inCalls?.action.kind === "payment_check", "после срока — первым «пришла ли оплата?»", inCalls?.action);
const pc = await call("POST", `/api/debtors/${c.id}/payment-check`, { answer: "partial", amount: 3000, method: "transfer", days: 3 });
ok(pc.status === 200, "частичная оплата принята", pc.body);
d = await detail(c.id);
ok(d.remaining === 7000, "осталось 7 000", d.remaining);
rd = await rentalDebt(r.id);
const repAfter = (await call("GET", `/api/damage-reports?rentalId=${r.id}`)).body.items.find((x) => x.id === act.id);
ok(repAfter.debt === 7000, "акт в аренде: долг 7 000 (оплата из «Должников» дошла)", repAfter.debt);

console.log("\n4. Больше остатка — отказ");
const over = await call("POST", `/api/debtors/${c.id}/payments`, { amount: 8000, method: "cash" });
ok(over.status === 400, "платёж 8 000 при остатке 7 000 отклонён", over.status);

console.log("\n5. Пеня п. 5.7: включили, 3 дня назад");
await call("PATCH", `/api/debtors/${c.id}`, { penaltyEnabled: true });
await sql`update debtors set penalty_from = current_date - 3 where id=${c.id}`;
d = await detail(c.id);
ok(d.penalty === 3000 && d.remaining === 10000, "пеня 3 000, к оплате 10 000", { pen: d.penalty, rem: d.remaining });

console.log("\n6. Оплата всего остатка 10 000 в «Должниках»");
const finesBefore = await sql`select coalesce(sum(amount),0)::int s from payments where rental_id=${r.id} and type='fine' and paid`;
const pay = await call("POST", `/api/debtors/${c.id}/payments`, { amount: 10000, method: "cash" });
ok(pay.status === 200, "платёж принят", pay.body);
d = await detail(c.id);
ok(d.stage === "closed_paid" && d.remaining === 0, "дело закрыто автоматически", { st: d.stage, rem: d.remaining });
const rep2 = (await call("GET", `/api/damage-reports?rentalId=${r.id}`)).body.items.find((x) => x.id === act.id);
ok(rep2.debt === 0 && rep2.paidSum === 12000, "акт оплачен ровно на 12 000", { debt: rep2.debt, paid: rep2.paidSum });
const finesAfter = await sql`select coalesce(sum(amount),0)::int s from payments where rental_id=${r.id} and type='fine' and paid`;
ok(finesAfter[0].s - finesBefore[0].s === 3000, "пеня 3 000 — платежом в аренду (в выручку)", finesAfter[0].s - finesBefore[0].s);
ok(((await client(r.client_id)).unpaidDamageDebt ?? 0) === (clientBefore.unpaidDamageDebt ?? 0),
  "у клиента «долг по ущербу» вернулся к прежнему");
c = await caseOf(r.id, act.id);
ok(c.remaining === 0, "карточка аренды: открытого ущерба нет");

console.log("\n7. Оплату ущерба отменили (откат) → дело снова открыто");
await sql`update payments set paid=false where id = (select id from payments where damage_report_id=${act.id} and type='damage' and paid order by id desc limit 1)`;
c = await caseOf(r.id, act.id);
d = await detail(c.id);
ok(d.stage === "created" && d.remaining > 0, "дело переоткрыто, остаток снова есть", { st: d.stage, rem: d.remaining });

console.log("\n8. Списали дело → ущерба в аренде и у клиента больше нет");
const wo = await call("POST", `/api/debtors/${c.id}/close`, { toStage: "closed_written_off", reason: "ТЕСТ списание" });
ok(wo.status === 200, "списано", wo.body);
c = await caseOf(r.id, act.id);
ok(c.stage === "closed_written_off", "дело списано");
const cl = await client(r.client_id);
ok((cl.unpaidDamageDebt ?? 0) === (clientBefore.unpaidDamageDebt ?? 0), "у клиента долга по ущербу нет", cl.unpaidDamageDebt);
const c2 = await caseOf(r.id, act.id);
ok(c2.stage === "closed_written_off", "sync не открыл списанное дело заново");

console.log("\n9. Новое дело без комментария — отказ");
const noc = await call("POST", "/api/debtors", { clientId: r.client_id, type: "damage", totalAmount: 100 });
ok(noc.status === 400, "без комментария не создаётся", noc.status);


console.log("\n10. Претензия печатает реальную задолженность");
{
  const act2 = (await call("POST", "/api/damage-reports", {
    rentalId: r.id, depositCovered: 0, payDays: 7,
    items: [{ name: "ТЕСТ зеркало", originalPrice: 5000, finalPrice: 5000, quantity: 1 }],
  })).body;
  await call("POST", `/api/damage-reports/${act2.id}/payment`, { amount: 1500, method: "cash" });
  const res = await fetch(`${API}/api/damage-reports/${act2.id}/claim?format=html`, { headers: { cookie } });
  const html = await res.text();
  const line = html.match(/Общая сумма задолженности:[^<]*/)?.[0] ?? "";
  ok(/3[\s  ]?500/.test(line), "в претензии 3 500 (5 000 − оплачено 1 500)", line);

  console.log("\n11. Удалили акт → его дело закрыто, не висит сиротой");
  const c3 = await caseOf(r.id, act2.id);
  const blocked = await call("DELETE", `/api/damage-reports/${act2.id}`);
  ok(blocked.status === 409, "акт с оплатой удалить нельзя", blocked.status);
  ok((await detail(c3.id)).stage === "created", "и дело при этом не закрыто");
  const act3 = (await call("POST", "/api/damage-reports", {
    rentalId: r.id, depositCovered: 0, payDays: 7,
    items: [{ name: "ТЕСТ без оплат", originalPrice: 700, finalPrice: 700, quantity: 1 }],
  })).body;
  const c4 = await caseOf(r.id, act3.id);
  const del = await call("DELETE", `/api/damage-reports/${act3.id}`);
  ok(del.status === 200 || del.status === 204, "акт без оплат удалён", del.status);
  const d3 = await detail(c4.id);
  ok(d3.stage === "closed_written_off", "его дело закрыто «акт удалён»", { st: d3.stage, why: d3.closedReason });
}

console.log("\n12. Долг за аренду: закрытая аренда с ручным долгом 1 500");
{
  const [cr] = await sql`
    select r.id, r.client_id from rentals r
    where r.status='completed'
      and not exists (select 1 from debtors x where x.related_rental_id=r.id)
      and not exists (select 1 from payments p where p.rental_id=r.id and p.type='rent' and not p.paid)
    order by r.id desc limit 1`;
  const rid = Number(cr.id);
  await sql`insert into debt_entries (rental_id, kind, amount, comment) values (${rid}, 'manual_charge', 1500, 'ТЕСТ ручной долг')`;
  // и акт по этой же аренде — дело ущерба не должно мешать делу «долг за аренду»
  await call("POST", "/api/damage-reports", { rentalId: rid, depositCovered: 0, payDays: 7,
    items: [{ name: "ТЕСТ", originalPrice: 1000, finalPrice: 1000, quantity: 1 }] });
  const items = (await call("GET", `/api/debtors/by-rentals?ids=${rid}`)).body.items;
  const rc = items.find((x) => x.type === "rental_overdue");
  ok(!!rc && rc.remaining === 1500, "дело «долг за аренду» 1 500 заведено (рядом с делом ущерба)", items);
  const pr = await call("POST", `/api/debtors/${rc.id}/payments`, { amount: 1000, method: "cash" });
  ok(pr.status === 200, "в «Должниках» принято 1 000", pr.body);
  const forg = await sql`select coalesce(sum(amount),0)::int s from debt_entries where rental_id=${rid} and kind='manual_forgive'`;
  ok(forg[0].s === 1000, "в аренде ручной долг погашен на 1 000", forg[0].s);
  const rentPaid = await sql`select coalesce(sum(amount),0)::int s from payments where rental_id=${rid} and type='rent' and paid and note like '%Должник%'`;
  ok(rentPaid[0].s === 1000, "1 000 — платежом аренды (в выручке)", rentPaid[0].s);
  const d4 = await detail(rc.id);
  ok(d4.remaining === 500, "в деле осталось 500", d4.remaining);
  const over2 = await call("POST", `/api/debtors/${rc.id}/payments`, { amount: 600, method: "cash" });
  ok(over2.status === 400, "больше остатка (600 > 500) — отказ", over2.status);
  const rp = await call("POST", `/api/rentals/${rid}/debt/payment`, { kind: "manual_payment", amount: 500, method: "cash" });
  ok(rp.status === 200 || rp.status === 201, "в карточке аренды принято 500", rp.body);
  const items2 = (await call("GET", `/api/debtors/by-rentals?ids=${rid}`)).body.items;
  const rc2 = items2.find((x) => x.id === rc.id);
  ok(rc2.stage === "closed_paid", "дело «долг за аренду» закрылось само", rc2);
}

console.log(`\nИТОГ: ${pass} ✓, ${fail} ✗`);
await sql.end();
process.exit(fail ? 1 : 0);
