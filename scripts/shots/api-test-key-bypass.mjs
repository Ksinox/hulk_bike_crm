/**
 * Обходы ключа директора (22.10) — живая проверка на превью (ключ там задан).
 * Защищённые запросы должны получать 428 «нужен ключ» и ничего не менять;
 * обычные действия — проходить без ключа, как раньше.
 *
 * Только свои тестовые данные: скутер «AIMA ТЕСТ 1», клиент «Покупкин Тест»,
 * аренда с суммой 0 (в конце завершается). Защиту общих настроек проверяем
 * на НЕсуществующем имени — настоящий ключ и наценки не трогаем никогда.
 *
 *   SHOTBOT_PASS=… node scripts/shots/api-test-key-bypass.mjs
 */
const API = process.env.SHOT_API ?? "https://api-preview.104-128-128-96.sslip.io";
const TEST_SCOOTER = 74;
const CLIENT_ID = 15;

const login = await fetch(API + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ login: "shotbot", password: process.env.SHOTBOT_PASS, remember: true }),
});
const cookie = /hulk_session=([^;]+)/.exec(login.headers.get("set-cookie") ?? "")?.[1];
if (!cookie) process.exit(1);
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
const scooter = async (id) => (await call("GET", `/api/scooters/${id}`)).data;
const rental = async (id) => (await call("GET", `/api/rentals/${id}`)).data;

const status = (await call("GET", "/api/approvals/status")).data;
ok(status?.keySet === true, "на превью задан ключ директора — проверка имеет смысл");
if (!status?.keySet) process.exit(1);

// ── Настройки ──
const all = (await call("GET", "/api/app-settings")).data;
ok(!(all.items ?? []).some((x) => x.key === "director_key_hash"), "хэш ключа не отдаётся в списке настроек");
ok((await call("GET", "/api/app-settings/director_key_hash")).status === 404, "хэш ключа не читается напрямую");
const probe = await call("PUT", "/api/app-settings/zz_probe_protected", { value: "1" });
ok(probe.status === 403, "произвольная настройка через общий PUT не пишется", `статус ${probe.status}`);
const wh = (all.items ?? []).find((x) => x.key === "work_hours_start");
if (wh) {
  const same = await call("PUT", "/api/app-settings/work_hours_start", { value: wh.value });
  ok(same.status === 200, "часы работы — пишутся как раньше (то же значение)", `статус ${same.status}`);
}

// ── Свободный скутер для замены ──
const scooters = (await call("GET", "/api/scooters")).data;
const rentalsAll = (await call("GET", "/api/rentals")).data;
const busy = new Set((rentalsAll.items ?? rentalsAll).filter((r) => r.status === "active").map((r) => r.scooterId));
const target = (scooters.items ?? scooters).find(
  (s) => s.baseStatus === "rental_pool" && !s.archivedAt && s.id !== TEST_SCOOTER && !busy.has(s.id),
);
ok(!!target, "свободный скутер для замены", target?.name);
const testBefore = await scooter(TEST_SCOOTER);

// ── Тестовая аренда ──
const start = new Date();
const created = await call("POST", "/api/rentals", {
  clientId: CLIENT_ID,
  scooterId: TEST_SCOOTER,
  status: "active",
  tariffPeriod: "short",
  rate: 1,
  deposit: 0,
  startAt: start.toISOString(),
  endPlannedAt: new Date(start.getTime() + 86400000).toISOString(),
  days: 1,
  sum: 0,
  paymentMethod: "cash",
  note: "ТЕСТ ключ директора shotbot — проверка 22.10, можно удалить",
  allowSecondForClient: true,
});
const rid = created.data?.id ?? created.data?.rental?.id;
ok(!!rid, "тестовая аренда создана", `#${rid}`);

// PATCH аренды: скутер напрямую — запрещено
const pt = await call("PATCH", `/api/rentals/${rid}`, { scooterId: target.id });
ok(pt.status === 409, "смена скутера через PATCH аренды — запрещена (только «Заменить»)", `статус ${pt.status}`);
ok((await rental(rid)).scooterId === TEST_SCOOTER, "скутер аренды не изменился");

// Замена со сменой категории снятого — нужен ключ
const sw1 = await call("POST", `/api/rentals/${rid}/swap-scooter`, {
  newScooterId: target.id,
  oldScooterStatus: "repair",
  reasonCategory: "other",
  prevScooterMileage: testBefore.mileage ?? 0,
});
ok(sw1.status === 428, "замена «снятый → в ремонт» — требует ключ", `статус ${sw1.status}`);
ok((await rental(rid)).scooterId === TEST_SCOOTER && (await scooter(TEST_SCOOTER)).baseStatus === testBefore.baseStatus, "ничего не изменилось");

// Замена без смены категории — как раньше
const sw2 = await call("POST", `/api/rentals/${rid}/swap-scooter`, {
  newScooterId: target.id,
  oldScooterStatus: "rental_pool",
  reasonCategory: "other",
  prevScooterMileage: testBefore.mileage ?? 0,
});
ok(sw2.status === 200, "замена «снятый → в парк» — без ключа", `статус ${sw2.status}`);
// Свежий откат — без ключа
const act = ((await call("GET", `/api/activity?entity=rental&entityId=${rid}&limit=10`)).data.items ?? []).find((x) => x.action === "scooter_swapped");
const rb = await call("POST", `/api/rentals/${rid}/rollback-action`, { activityId: act?.id });
ok(rb.status === 200, "отмена замены в первые 10 минут — без ключа", `статус ${rb.status}`);

// Поздний откат чужой давней операции — нужен ключ (и ничего не меняется)
const old = ((await call("GET", "/api/activity?limit=200")).data.items ?? []).find(
  (x) => x.entity === "rental" && x.action === "scooter_swapped" && Date.now() - new Date(x.createdAt).getTime() > 86400000,
);
if (old) {
  const late = await call("POST", `/api/rentals/${old.entityId}/rollback-action`, { activityId: old.id });
  ok(late.status === 428, "отмена операции позже 10 минут — требует ключ", `статус ${late.status}`);
}

// Платёж: принятый — менять сумму / снимать «оплачен» только с ключом
const pay = await call("POST", "/api/payments", { rentalId: rid, type: "rent", amount: 1, method: "cash", paid: true, note: "ТЕСТ ключ директора" });
const pid = pay.data?.id;
ok(!!pid, "тестовый платёж 1 ₽ создан");
const pa = await call("PATCH", `/api/payments/${pid}`, { amount: 2 });
ok(pa.status === 428, "сумма принятого платежа — требует ключ", `статус ${pa.status}`);
const pu = await call("PATCH", `/api/payments/${pid}`, { paid: false });
ok(pu.status === 428, "«не оплачен» у принятого платежа — требует ключ", `статус ${pu.status}`);
const pm = await call("PATCH", `/api/payments/${pid}`, { method: "transfer" });
ok(pm.status === 200, "способ оплаты — без ключа, как раньше", `статус ${pm.status}`);
// «Отменить» умеет только платежи из обычного приёма оплаты — тестовый,
// созданный напрямую, он не отменяет (422, к ключу не относится). Платёж
// 1 ₽ с пометкой «ТЕСТ» после проверки удаляется из базы превью вручную.
console.log(`· тестовый платёж #${pid} (1 ₽, «ТЕСТ») — удалить из базы превью после проверки`);

// Завершение: скутер не в парк — нужен ключ; в парк — как раньше
const base = {
  dateActual: new Date().toISOString().slice(0, 10),
  conditionOk: true,
  equipmentOk: true,
  depositReturned: true,
  returnReason: "ТЕСТ",
  mileageAtReturn: testBefore.mileage ?? 0,
};
const c1 = await call("POST", `/api/rentals/${rid}/complete`, { ...base, scooterNextStatus: "repair" });
ok(c1.status === 428, "закрытие аренды «скутер в ремонт» — требует ключ", `статус ${c1.status}`);
ok((await rental(rid)).status === "active", "аренда не закрылась");
const c2 = await call("POST", `/api/rentals/${rid}/complete`, { ...base, scooterNextStatus: "rental_pool" });
ok(c2.status === 200, "закрытие аренды «скутер в парк» — без ключа", `статус ${c2.status}`);

const fin = await scooter(TEST_SCOOTER);
ok(fin.baseStatus === testBefore.baseStatus && (fin.mileage ?? 0) === (testBefore.mileage ?? 0), "тестовый скутер как был");
ok((await scooter(target.id)).baseStatus === "rental_pool", "скутер замены свободен", target.name);
console.log(`тестовая аренда: #${rid} (сумма 0, пометка «ТЕСТ»)`);
console.log(fails ? `\nПРОВАЛОВ: ${fails}` : "\nВсё сходится");
process.exit(fails ? 1 : 0);
