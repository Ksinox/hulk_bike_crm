/**
 * Пробег при замене скутера (17.10) — живая проверка сервера на превью.
 *
 * Заказчик: «при замене скутера система должна запрашивать пробег, так как
 * он возвращается в парк». Проверяем на своём тестовом скутере «AIMA ТЕСТ 1»
 * и аренде с суммой 0 (в выручку не идёт). Замену делаем на свободный
 * скутер и сразу откатываем — он возвращается в парк как был.
 *   1) лишние цифры (45 674 567 км) — 400;
 *   2) обычный рост — пробег снятого записан, в его хронологии «Пробег: …»,
 *      в хронологии аренды — «Пробег снятого скутера»;
 *   3) откат замены — пробег снятого вернулся;
 *   4) меньше без отметки — не записан;
 *   5) меньше с «исправлением» — записан, в хронологии «Пробег исправлен»;
 *   уборка: аренда завершена, пробег тестового скутера — как был.
 *
 *   SHOTBOT_PASS=… node scripts/shots/api-test-swap-mileage.mjs
 */
const API = process.env.SHOT_API ?? "https://api-preview.104-128-128-96.sslip.io";
const TEST_SCOOTER = Number(process.env.SCOOTER_ID ?? 74); // «AIMA ТЕСТ 1»
const CLIENT_ID = Number(process.env.CLIENT_ID ?? 15); // «Покупкин Тест Анкетович»

const login = await fetch(API + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ login: "shotbot", password: process.env.SHOTBOT_PASS, remember: true }),
});
const cookie = /hulk_session=([^;]+)/.exec(login.headers.get("set-cookie") ?? "")?.[1];
if (!cookie) {
  console.log("✗ вход не удался", login.status);
  process.exit(1);
}
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
const activity = async (entity, id) => {
  const r = await call("GET", `/api/activity?entity=${entity}&entityId=${id}&limit=15`);
  return r.data?.items ?? r.data ?? [];
};

// Свободный скутер для замены — любой готовый без открытой аренды.
const all = (await call("GET", "/api/scooters")).data;
const rentalsAll = (await call("GET", "/api/rentals")).data;
const busy = new Set((rentalsAll.items ?? rentalsAll).filter((r) => r.status === "active").map((r) => r.scooterId));
const target = (all.items ?? all).find(
  (s) => s.baseStatus === "rental_pool" && !s.archivedAt && s.id !== TEST_SCOOTER && !busy.has(s.id),
);
ok(!!target, "свободный скутер для замены найден", target ? `${target.name} (id ${target.id})` : "нет");
if (!target) process.exit(1);

const original = (await scooter(TEST_SCOOTER)).mileage ?? 0;
const testStatusBefore = (await scooter(TEST_SCOOTER)).baseStatus;
console.log(`тестовый скутер: пробег ${original}, статус ${testStatusBefore}`);
// Нужен ненулевой пробег, чтобы проверить «меньше записанного»: ставим 500
// (свой тестовый скутер), в конце вернём как было.
const base = original || 500;
if (!original) await call("PATCH", `/api/scooters/${TEST_SCOOTER}`, { mileage: base });

// Тестовая аренда на сутки с суммой 0.
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
  note: "ТЕСТ пробег при замене shotbot — проверка 17.10, можно удалить",
  allowSecondForClient: true,
});
const rid = created.data?.id ?? created.data?.rental?.id;
ok(!!rid, "тестовая аренда создана", `#${rid}`);
if (!rid) process.exit(1);

const swap = (extra) =>
  call("POST", `/api/rentals/${rid}/swap-scooter`, {
    newScooterId: target.id,
    oldScooterStatus: "rental_pool",
    reasonCategory: "other",
    reason: "ТЕСТ пробег при замене",
    ...extra,
  });
const lastSwapActivity = async () =>
  (await activity("rental", rid)).find((x) => x.action === "scooter_swapped");
const rollback = async () => {
  const act = await lastSwapActivity();
  return call("POST", `/api/rentals/${rid}/rollback-action`, { activityId: act?.id });
};

// 1) лишние цифры
const big = await swap({ prevScooterMileage: 45_674_567 });
ok(big.status === 400, "45 674 567 км не приняты", `статус ${big.status}`);

// 2) обычный рост
const grow = base + 150;
const s2 = await swap({ prevScooterMileage: grow });
ok(s2.status === 200, "замена с пробегом прошла", `статус ${s2.status}`);
ok((await scooter(TEST_SCOOTER)).mileage === grow, "пробег снятого записан", `${grow} км`);
const scAct = (await activity("scooter", TEST_SCOOTER)).find((x) => x.action === "mileage_updated");
ok(!!scAct && /снят при замене/.test(scAct.summary), "в хронологии скутера — пробег при замене", scAct?.summary ?? "нет");
const rAct = await lastSwapActivity();
ok(!!rAct?.diff?.prevMileage || /пробег снятого/.test(rAct?.summary ?? ""), "в хронологии аренды — пробег снятого", rAct?.summary ?? "нет");

// 3) откат замены
const rb = await rollback();
ok(rb.status === 200, "замена откатилась", `статус ${rb.status} ${typeof rb.data === "object" ? JSON.stringify(rb.data).slice(0, 80) : ""}`);
ok((await scooter(TEST_SCOOTER)).mileage === base, "пробег снятого вернулся", `${base} км`);
ok((await scooter(target.id)).baseStatus === "rental_pool", "скутер замены снова свободен");

// 4) меньше без отметки
const lower = base - 30;
{
  const s4 = await swap({ prevScooterMileage: lower });
  ok(s4.status === 200, "замена с меньшим пробегом без отметки проходит", `статус ${s4.status}`);
  ok((await scooter(TEST_SCOOTER)).mileage === base, "без отметки пробег не уменьшился");
  ok((await activity("scooter", TEST_SCOOTER)).some((x) => x.action === "mileage_skip" && /при замене/.test(x.summary)), "в хронологии — «не обновлён»");
  ok((await rollback()).status === 200, "откат");
  // 5) меньше с отметкой «исправление»
  const s5 = await swap({ prevScooterMileage: lower, prevScooterMileageCorrection: true });
  ok(s5.status === 200, "замена с исправлением пробега", `статус ${s5.status}`);
  ok((await scooter(TEST_SCOOTER)).mileage === lower, "пробег исправлен на меньший", `${lower} км`);
  ok((await activity("scooter", TEST_SCOOTER)).some((x) => x.action === "mileage_corrected" && /при замене/.test(x.summary)), "в хронологии — «Пробег исправлен при замене»");
  ok((await rollback()).status === 200, "откат");
  ok((await scooter(TEST_SCOOTER)).mileage === base, "после отката пробег прежний", `${base} км`);
}

// Уборка: завершить тестовую аренду, вернуть скутер и пробег как были.
const done = await call("POST", `/api/rentals/${rid}/complete`, {
  dateActual: new Date().toISOString().slice(0, 10),
  conditionOk: true,
  equipmentOk: true,
  depositReturned: true,
  returnReason: "ТЕСТ",
  scooterNextStatus: testStatusBefore === "rental_pool" ? "rental_pool" : testStatusBefore,
  mileageAtReturn: base,
});
ok(done.status === 200, "тестовая аренда завершена", `статус ${done.status}`);
const fin = await scooter(TEST_SCOOTER);
if (fin.mileage !== original) await call("PATCH", `/api/scooters/${TEST_SCOOTER}`, { mileage: original });
ok((await scooter(TEST_SCOOTER)).mileage === original, "пробег тестового скутера как был", `${original} км`);
ok((await scooter(target.id)).baseStatus === "rental_pool", "скутер замены свободен, как был", target.name);
console.log(`тестовая аренда: #${rid} (сумма 0, пометка «ТЕСТ»)`);
console.log(fails ? `\nПРОВАЛОВ: ${fails}` : "\nВсё сходится");
process.exit(fails ? 1 : 0);
