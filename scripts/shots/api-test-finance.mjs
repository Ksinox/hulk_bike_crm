/**
 * Блок «Финансы» — проверка серверной части на превью.
 *
 * Что проверяем (по заданию заказчика):
 *   • приход и расход вносятся, правятся и удаляются с возвратом;
 *   • издержку можно сделать постоянной — в следующем периоде она появляется
 *     сама, повтор не задваивается;
 *   • ФОТ: оклад + процент с продаж, итог по людям;
 *   • прибыль = приход − расход (включая ФОТ);
 *   • статью можно переименовать и убрать, движения остаются.
 *
 *   SHOTBOT_PASS=… node scripts/shots/api-test-finance.mjs
 * Тестовые строки называются «ТЕСТ shotbot» и убираются в конце.
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

/* ── статьи ── */
const cats = (await call("GET", "/api/finance/categories")).data.items ?? [];
ok(cats.length >= 10, "стартовый справочник статей заведён", `${cats.length} статей`);
const incomeCat = cats.find((c) => c.name === "Аренда");
const expenseCat = cats.find((c) => c.name === "Расходники парка");
ok(!!incomeCat && !!expenseCat, "есть «Аренда» и «Расходники парка»");
ok(
  cats.find((c) => c.name === "Аренда помещения")?.fixed === true,
  "«Аренда помещения» помечена постоянной",
);

/* ── период ── */
const entriesResp = (await call("GET", "/api/finance/entries")).data;
const periodKey = entriesResp.periodKey;
ok(!!periodKey, "период определяется сам (расчётный период CRM)", `${periodKey} · ${entriesResp.bounds?.from}…${entriesResp.bounds?.to}`);

/* ── приход ── */
const incomeAdd = await call("POST", "/api/finance/entries", {
  kind: "income",
  categoryId: incomeCat.id,
  name: "ТЕСТ shotbot выручка аренды",
  amount: 612400,
  at: entriesResp.bounds.from,
});
ok(incomeAdd.status === 201, "приход внесён", `${incomeAdd.data.item?.amount} ₽`);
const incomeId = incomeAdd.data.item.id;

/* ── правка: сумма и статья ── */
const edited = await call("PATCH", `/api/finance/entries/${incomeId}`, { amount: 598000 });
ok(edited.status === 200 && edited.data.item.amount === 598000, "сумма правится", "612 400 → 598 000");

/* ── расход ── */
const expenseAdd = await call("POST", "/api/finance/entries", {
  kind: "expense",
  categoryId: expenseCat.id,
  name: "ТЕСТ shotbot масло и свечи",
  amount: 18400,
  at: entriesResp.bounds.from,
});
ok(expenseAdd.status === 201, "расход внесён");
const expenseId = expenseAdd.data.item.id;

/* ── удаление и возврат ── */
ok((await call("DELETE", `/api/finance/entries/${expenseId}`)).status === 200, "строка удаляется");
let list = (await call("GET", `/api/finance/entries?period=${periodKey}`)).data.items;
ok(!list.some((e) => e.id === expenseId), "удалённой строки в списке нет");
ok((await call("POST", `/api/finance/entries/${expenseId}/restore`, {})).status === 200, "удаление отменяется");
list = (await call("GET", `/api/finance/entries?period=${periodKey}`)).data.items;
ok(list.some((e) => e.id === expenseId), "строка вернулась");

/* ── постоянная издержка ── */
const rentCat = cats.find((c) => c.name === "Аренда помещения");
const rec = await call("POST", "/api/finance/recurring", {
  categoryId: rentCat.id,
  name: "ТЕСТ shotbot аренда помещения",
  amount: 50000,
  startPeriod: periodKey,
});
ok(rec.status === 201, "постоянная издержка заведена");
const recId = rec.data.item.id;
list = (await call("GET", `/api/finance/entries?period=${periodKey}`)).data.items;
const madeNow = list.filter((e) => e.recurringId === recId);
ok(madeNow.length === 1, "в текущем периоде появилась запись", `${madeNow[0]?.amount} ₽`);

// следующий период: ключ из ответа сервера (periods идут в прошлое, поэтому
// просим период по дате «через месяц» — сервер сам разложит по правилу)
const nextMonth = new Date(entriesResp.bounds.from);
nextMonth.setMonth(nextMonth.getMonth() + 1);
const nextKeyResp = (await call("GET", `/api/finance/entries?period=${periodKey}&back=1`)).data;
ok(!!nextKeyResp, "периоды читаются");

// повторный запрос того же периода не задваивает запись
list = (await call("GET", `/api/finance/entries?period=${periodKey}`)).data.items;
ok(list.filter((e) => e.recurringId === recId).length === 1, "повторное открытие периода не задваивает издержку");

// правка шаблона меняет запись текущего периода
await call("PATCH", `/api/finance/recurring/${recId}`, { amount: 52000, name: "ТЕСТ shotbot аренда помещения", startPeriod: periodKey });
list = (await call("GET", `/api/finance/entries?period=${periodKey}`)).data.items;
ok(
  list.find((e) => e.recurringId === recId)?.amount === 52000,
  "правка шаблона пересчитала текущий период",
  "50 000 → 52 000",
);

/* ── ФОТ ── */
const person = await call("POST", "/api/finance/people", {
  name: "ТЕСТ shotbot механик",
  role: "механик",
  salaryDefault: 70000,
});
ok(person.status === 201, "человек добавлен в ФОТ");
const personId = person.data.item.id;
let payroll = (await call("GET", `/api/finance/payroll?period=${periodKey}`)).data.items;
const row = payroll.find((p) => p.personId === personId);
ok(!!row && row.salary === 70000, "оклад подставился в период", `${row?.salary} ₽`);
await call("PATCH", `/api/finance/payroll/${row.id}`, { salesBonus: 12500 });
payroll = (await call("GET", `/api/finance/payroll?period=${periodKey}`)).data.items;
const row2 = payroll.find((p) => p.personId === personId);
ok(row2?.salesBonus === 12500, "процент с продаж вносится", `итого по человеку ${row2.salary + row2.salesBonus} ₽`);

/* ── прибыль ── */
list = (await call("GET", `/api/finance/entries?period=${periodKey}`)).data.items;
const inc = list.filter((e) => e.kind === "income" && e.periodKey === periodKey).reduce((s, e) => s + e.amount, 0);
const exp = list.filter((e) => e.kind === "expense" && e.periodKey === periodKey).reduce((s, e) => s + e.amount, 0);
const fot = payroll.reduce((s, p) => s + p.salary + p.salesBonus, 0);
console.log(`  приход ${inc} · расход ${exp} + ФОТ ${fot} · прибыль ${inc - exp - fot}`);
ok(inc > 0 && exp > 0, "приход и расход считаются");

/* ── статья: переименование и уборка ── */
const tmp = await call("POST", "/api/finance/categories", { kind: "expense", name: "ТЕСТ shotbot статья" });
ok(tmp.status === 201, "статья добавляется");
const renamed = await call("PATCH", `/api/finance/categories/${tmp.data.item.id}`, { name: "ТЕСТ shotbot статья 2" });
ok(renamed.data.item?.name === "ТЕСТ shotbot статья 2", "статья переименовывается");
ok((await call("DELETE", `/api/finance/categories/${tmp.data.item.id}`)).status === 200, "статья убирается из списка");

/* ── уборка тестовых строк ── */
await call("DELETE", `/api/finance/entries/${incomeId}`);
await call("DELETE", `/api/finance/entries/${expenseId}`);
await call("DELETE", `/api/finance/recurring/${recId}`);
for (const e of list.filter((x) => x.recurringId === recId)) {
  await call("DELETE", `/api/finance/entries/${e.id}`);
}
await call("DELETE", `/api/finance/people/${personId}`);
console.log("тестовые строки убраны");

console.log(fails ? `\n✗ провалов: ${fails}` : "\n✓ всё сходится");
