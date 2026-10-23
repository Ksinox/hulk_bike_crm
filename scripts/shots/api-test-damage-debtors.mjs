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

// Тестовый директор (только в копии базы): подтверждает защищённые операции.
let dirCookie = "";
async function asDirector(method, path, body) {
  if (!dirCookie) {
    const r = await fetch(API + "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: "sb_director", password: process.env.SB_PASS }),
    });
    dirCookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  }
  const r = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", cookie: dirCookie, "x-director-approval": "self" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

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
await sql`update debtors set payment_due_date = (now() at time zone 'Europe/Moscow')::date - 1 where id=${c.id}`;
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
await sql`update debtors set penalty_from = (now() at time zone 'Europe/Moscow')::date - 3 where id=${c.id}`;
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
const wo = await asDirector("POST", `/api/debtors/${c.id}/close`, { toStage: "closed_written_off", reason: "ТЕСТ списание" });
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


console.log("\n13. Выкуп → «Должники»: просрочка по графику");
{
  const [dl] = await sql`select id from buyout_deals where status='active' order by id limit 1`;
  const dealId = Number(dl.id);
  const [row] = await sql`select id, amount, paid_amount from buyout_schedule where deal_id=${dealId} and paid_amount < amount order by seq limit 1`;
  await sql`update buyout_schedule set due_date = current_date - 5 where id=${row.id}`;
  const owe = Number(row.amount) - Number(row.paid_amount);
  const noComment = await call("POST", `/api/buyout/deals/${dealId}/to-debtors`, { comment: "" });
  ok(noComment.status === 400, "без комментария не передаётся", noComment.status);
  const tr = await call("POST", `/api/buyout/deals/${dealId}/to-debtors`, { comment: "ТЕСТ не платит вторую неделю" });
  ok(tr.status === 200 && tr.body.debtor?.id, "передано в «Должники»", tr.body);
  const bc = await detail(tr.body.debtor.id);
  ok(bc.type === "buyout_overdue" && bc.remaining === owe, `в деле к взысканию — просрочка ${owe}`, { t: bc.type, rem: bc.remaining });
  ok(bc.buyoutDeal?.overdueAmount === owe, "в деле видна сводка сделки", bc.buyoutDeal);
  const again = await call("POST", `/api/buyout/deals/${dealId}/to-debtors`, { comment: "ТЕСТ повтор" });
  ok(again.body.existed === true && again.body.debtor.id === tr.body.debtor.id, "повторно — то же дело, не дубль");
  const deals = (await call("GET", "/api/buyout/deals")).body.items;
  ok(deals.find((x) => x.id === dealId)?.debtorCase?.id === tr.body.debtor.id, "в сделке видна ссылка на дело");
  const bpBefore = await sql`select coalesce(sum(amount),0)::int s from buyout_payments where deal_id=${dealId}`;
  const half = Math.floor(owe / 2);
  const p1 = await call("POST", `/api/debtors/${tr.body.debtor.id}/payments`, { amount: half, method: "cash" });
  ok(p1.status === 200, `в «Должниках» принято ${half}`, p1.body);
  const bpAfter = await sql`select coalesce(sum(amount),0)::int s from buyout_payments where deal_id=${dealId}`;
  ok(bpAfter[0].s - bpBefore[0].s === half, "платёж записан в выкуп", bpAfter[0].s - bpBefore[0].s);
  const [r2] = await sql`select paid_amount from buyout_schedule where id=${row.id}`;
  ok(Number(r2.paid_amount) === Number(row.paid_amount) + half, "строка графика погашена частично");
  const bc2 = await detail(tr.body.debtor.id);
  ok(bc2.remaining === owe - half && bc2.paid === half, "в деле: оплачено и остаток сходятся", { rem: bc2.remaining, paid: bc2.paid });
  // остаток — в карточке выкупа
  const p2 = await call("POST", `/api/buyout/deals/${dealId}/payments`, { amount: owe - half, method: "transfer" });
  ok(p2.status === 200, "в карточке выкупа принят остаток просрочки", p2.body);
  await call("GET", "/api/debtors"); // sync
  const bc3 = await detail(tr.body.debtor.id);
  ok(bc3.stage === "closed_paid", "клиент догнал график — дело закрылось само", { st: bc3.stage, why: bc3.closedReason });
}


console.log("\n14. Долг за аренду: оплата частями в карточке аренды и паркинг — всё видно в деле");
{
  const [cr] = await sql`
    select r.id from rentals r
    where r.status='completed'
      and not exists (select 1 from debtors x where x.related_rental_id=r.id)
      and not exists (select 1 from payments p where p.rental_id=r.id and p.type='rent' and not p.paid)
    order by r.id desc offset 1 limit 1`;
  const rid = Number(cr.id);
  await sql`insert into debt_entries (rental_id, kind, amount, comment) values (${rid}, 'manual_charge', 2000, 'ТЕСТ ручной долг 2')`;
  let items = (await call("GET", `/api/debtors/by-rentals?ids=${rid}`)).body.items;
  const rc = items.find((x) => x.type === "rental_overdue");
  ok(!!rc && rc.remaining === 2000, "дело «долг за аренду» 2 000 заведено", items);
  const rp = await call("POST", `/api/rentals/${rid}/debt/payment`, { kind: "manual_payment", amount: 700, method: "cash" });
  ok(rp.status === 200 || rp.status === 201, "в карточке аренды принято 700 (частично)", rp.status);
  let d5 = await detail(rc.id);
  ok(d5.paid === 700 && d5.remaining === 1300, "в деле: оплачено 700, осталось 1 300", { paid: d5.paid, rem: d5.remaining });
  ok(d5.payments.some((p) => p.paidAmount === 700 && /карточке аренды/.test(p.note ?? "")), "в деле строка «Принято в карточке аренды»", d5.payments.map((p) => [p.paidAmount, p.note]));
  // паркинг: насчитали 750 и оплатили в карточке аренды
  await sql`insert into parking_sessions (rental_id, start_date, end_date, days, amount, paid_amount) values (${rid}, current_date - 3, current_date, 3, 750, 0)`.catch(async (e) => {
    console.log("    (паркинг: другая схема)", e.message);
  });
  d5 = await detail(rc.id);
  const withPark = d5.remaining;
  const pk = await call("POST", `/api/rentals/${rid}/parking/pay`, { amount: 750, method: "cash" });
  if (pk.status === 200 || pk.status === 201) {
    d5 = await detail(rc.id);
    ok(d5.remaining === withPark - 750, "паркинг оплачен в аренде — в деле остаток меньше на 750", { before: withPark, after: d5.remaining });
    ok(d5.payments.some((p) => p.paidAmount === 750 && /паркинг/.test(p.note ?? "")), "в деле строка про паркинг");
  } else console.log("    паркинг:", pk.status, JSON.stringify(pk.body).slice(0, 120));

  console.log("\n15. Платёж в аренде отменили — из дела он тоже уходит");
  const [lastRent] = await sql`select id from payments where rental_id=${rid} and type='rent' and paid and amount=700 order by id desc limit 1`;
  await sql`update payments set paid=false where id=${lastRent.id}`;
  d5 = await detail(rc.id);
  ok(!d5.payments.some((p) => p.paidAmount === 700), "строки про 700 больше нет", d5.payments.map((p) => p.paidAmount));
  await sql`update payments set paid=true where id=${lastRent.id}`;

  console.log("\n16. Закрыть без денег и «Убрать из «Должников»» — только с ключом директора");
  const cl = await call("POST", `/api/debtors/${rc.id}/close`, { toStage: "closed_settled", reason: "ТЕСТ мировая" });
  ok(cl.status === 428, "мировая без ключа — нужен ключ директора (428)", cl.status);
  ok(!!cl.body?.brief?.summary, "директор видит, что за дело и сколько осталось", cl.body?.brief);
  const tr2 = await call("POST", `/api/debtors/${rc.id}/transition`, { toStage: "closed_written_off", reason: "ТЕСТ" });
  ok(tr2.status === 428, "списание через ход дела — тоже с ключом", tr2.status);
  const rmNo = await call("DELETE", `/api/debtors/${rc.id}`, { reason: "" });
  ok(rmNo.status === 400, "убрать без причины — нельзя", rmNo.status);
  const rm = await call("DELETE", `/api/debtors/${rc.id}`, { reason: "ТЕСТ договорились" });
  ok(rm.status === 428, "убрать с причиной — нужен ключ директора", rm.status);
  ok((await detail(rc.id)).stage !== "closed_written_off", "без ключа дело не тронуто");
  const rmOk = await asDirector("DELETE", `/api/debtors/${rc.id}`, { reason: "ТЕСТ договорились" });
  ok(rmOk.status === 200, "директор подтвердил — убрано", rmOk.status);
  const d7 = await detail(rc.id);
  ok(d7.stage === "closed_written_off" && /Убрано из/.test(d7.closedReason ?? ""), "дело закрыто «Убрано из «Должников»: …»", { st: d7.stage, why: d7.closedReason });
  await call("GET", "/api/debtors");
  ok((await detail(rc.id)).stage === "closed_written_off", "синхронизация его заново не заводит");
}

console.log("\n17. Выкуп: платёж в самой сделке — строка в деле");
{
  const [dl] = await sql`select id from buyout_deals where status='active' order by id desc limit 1`;
  const dealId = Number(dl.id);
  const [row] = await sql`select id, amount, paid_amount from buyout_schedule where deal_id=${dealId} and paid_amount < amount order by seq limit 1`;
  await sql`update buyout_schedule set due_date = current_date - 3 where id=${row.id}`;
  const tr = await call("POST", `/api/buyout/deals/${dealId}/to-debtors`, { comment: "ТЕСТ выкуп 2" });
  const caseId = tr.body.debtor.id;
  const paidBefore = (await detail(caseId)).paid;
  const pay = await call("POST", `/api/buyout/deals/${dealId}/payments`, { amount: 1000, method: "cash" });
  ok(pay.status === 200, "в сделке выкупа принято 1 000", pay.status);
  const d6 = await detail(caseId);
  ok(d6.payments.some((p) => p.paidAmount === 1000 && /выкупа/.test(p.note ?? "")), "в деле строка «Принято в сделке выкупа»", d6.payments.map((p) => [p.paidAmount, p.note]));
  ok(d6.paid - paidBefore === 1000, "в деле оплачено +1 000", { before: paidBefore, after: d6.paid });
}


console.log("\n18. Смешанная оплата: нал и перевод — отдельными платежами (фильтр выручки)");
{
  // дело ущерба
  const act4 = (await call("POST", "/api/damage-reports", {
    rentalId: r.id, depositCovered: 0, payDays: 7,
    items: [{ name: "ТЕСТ смешанно", originalPrice: 5000, finalPrice: 5000, quantity: 1 }],
  })).body;
  const c5 = await caseOf(r.id, act4.id);
  const mx = await call("POST", `/api/debtors/${c5.id}/payments`, { amount: 5000, method: "mixed", cashAmount: 2000 });
  ok(mx.status === 200, "смешанно 5 000 (нал 2 000 + перевод 3 000) принято", mx.body);
  const dp = await sql`select method, amount from payments where damage_report_id=${act4.id} and type='damage' and paid order by method`;
  ok(dp.length === 2 && dp.find((x) => x.method === "cash")?.amount === 2000 && dp.find((x) => x.method === "transfer")?.amount === 3000,
    "в аренде два платежа ущерба: наличными 2 000 и переводом 3 000", dp);
  const d8 = await detail(c5.id);
  const row = d8.payments.find((p) => p.paidAmount === 5000);
  ok(row?.paidMethod === "mixed" && row?.cashAmount === 2000 && row?.transferAmount === 3000, "строка дела: смешанно, доли видны", row);
  ok(d8.stage === "closed_paid", "акт оплачен — дело закрыто");

  // ручное дело (без акта/аренды) — в выручку видом «Долг по делу»
  const man = await call("POST", "/api/debtors", { clientId: r.client_id, type: "damage", totalAmount: 1200, comment: "ТЕСТ ручное дело" });
  ok(man.status === 201, "ручное дело заведено", man.status);
  const before = await sql`select coalesce(sum(amount),0)::int s from payments where type='debtor' and note like ${"%" + man.body.caseNumber + "%"}`;
  const mp = await call("POST", `/api/debtors/${man.body.id}/payments`, { amount: 1200, method: "mixed", cashAmount: 500 });
  ok(mp.status === 200, "по ручному делу принято 1 200 смешанно", mp.body);
  const rev = await sql`select method, amount, rental_id from payments where type='debtor' and paid and note like ${"%" + man.body.caseNumber + "%"} order by method`;
  ok(rev.length === 2 && rev.find((x) => x.method === "cash")?.amount === 500 && rev.find((x) => x.method === "transfer")?.amount === 700,
    "в выручке: «Долг по делу» наличными 500 и переводом 700", rev);
  ok(before[0].s === 0 && Number(rev[0]?.rental_id) > 0, "привязано к аренде клиента");
  const d9 = await detail(man.body.id);
  ok(d9.stage === "closed_paid" && d9.paid === 1200, "ручное дело погашено и закрыто", { st: d9.stage, paid: d9.paid });
}

console.log("\n19. «Смешанно» в аренде: залог, паркинг, экипировка — две проводки, «Отменить» снимает обе");
{
  const [r2] = await sql`
    select r.id, r.deposit, r.deposit_original from rentals r
    where r.status='active' and r.archived_at is null and r.deposit_item is null and r.id <> ${r.id}
      and r.end_planned_at > now() + interval '3 days'
      and not exists (select 1 from parking_sessions s where s.rental_id=r.id)
    order by r.id desc limit 1`;
  const rid = Number(r2.id);
  const rowsAfter = async (minId, type) =>
    sql`select id, method, amount from payments where rental_id=${rid} and type=${type} and id > ${minId} order by id`;
  const [{ m0 }] = await sql`select coalesce(max(id),0)::bigint m0 from payments`;
  const undoLast = async (type) => {
    const [last] = await sql`select id from payments where rental_id=${rid} and type=${type} order by id desc limit 1`;
    return call("POST", `/api/rentals/${rid}/rollback-payment`, { paymentId: Number(last.id) });
  };
  const split = (rows) => ({ cash: rows.find((x) => x.method === "cash")?.amount, transfer: rows.find((x) => x.method === "transfer")?.amount, n: rows.length });

  // залог
  const t = await call("POST", `/api/rentals/${rid}/security-topup`, { amount: 1000, method: "mixed", cashAmount: 300 });
  ok(t.status === 200, "залог +1 000 смешанно принят", t.body);
  const ts = split(await rowsAfter(m0, "deposit"));
  ok(ts.n === 2 && ts.cash === 300 && ts.transfer === 700, "залог: наличными 300 и переводом 700", ts);
  const tu = await undoLast("deposit");
  const [rd] = await sql`select deposit from rentals where id=${rid}`;
  ok(tu.status === 200 && (await rowsAfter(m0, "deposit")).length === 0 && rd.deposit === r2.deposit,
    "«Отменить» снял обе проводки, залог как был", { st: tu.status, dep: rd.deposit });

  // паркинг
  const today = (await sql`select to_char((now() at time zone 'Europe/Moscow')::date, 'YYYY-MM-DD') d`)[0].d;
  const pk = await call("POST", `/api/rentals/${rid}/parking`, { startDate: today, endDate: today, freeFirstDay: false });
  ok(pk.status === 200 || pk.status === 201, "паркинг поставлен", pk.body);
  const due = (await sql`select amount from parking_sessions where rental_id=${rid} order by id desc limit 1`)[0].amount;
  const pp = await call("POST", `/api/rentals/${rid}/parking/pay`, { amount: due, method: "mixed", cashAmount: 100 });
  ok(pp.status === 200, `паркинг ${due} смешанно оплачен`, pp.body);
  const ps = split(await rowsAfter(m0, "parking"));
  ok(ps.n === 2 && ps.cash === 100 && ps.transfer === due - 100, "паркинг: наличными 100 и переводом остаток", ps);
  const pu = await undoLast("parking");
  const [sess] = await sql`select paid_amount from parking_sessions where rental_id=${rid} order by id desc limit 1`;
  ok(pu.status === 200 && (await rowsAfter(m0, "parking")).length === 0 && sess.paid_amount === 0,
    "«Отменить» снял обе проводки паркинга, сессия снова не оплачена", { st: pu.status, b: pu.body, paid: sess.paid_amount });

  // экипировка
  const [eqRow] = await sql`select equipment_json from rentals where id=${rid}`;
  const items = [...(eqRow.equipment_json ?? []), { name: "ТЕСТ доплата", price: 100, free: false }];
  const ec = await call("POST", `/api/rentals/${rid}/equipment-change`, { newEquipmentJson: items, payNow: true, method: "mixed", cashAmount: 50 });
  ok(ec.status === 200, "экипировка с доплатой смешанно", ec.body);
  const es = split(await rowsAfter(m0, "equipment_fee"));
  ok(es.n === 2 && es.cash === 50 && es.transfer > 0, "доплата: наличными 50 и переводом остаток", es);
  const eu = await undoLast("equipment_fee");
  ok(eu.status === 200 && (await rowsAfter(m0, "equipment_fee")).length === 0, "«Отменить» снял обе проводки доплаты", { st: eu.status, b: eu.body });
  // уборка: паркинг-сессия теста
  await sql`delete from parking_sessions where rental_id=${rid} and paid_amount=0 and created_at > now() - interval '1 hour'`;
}

console.log(`\nИТОГ: ${pass} ✓, ${fail} ✗`);
await sql.end();
process.exit(fail ? 1 : 0);
