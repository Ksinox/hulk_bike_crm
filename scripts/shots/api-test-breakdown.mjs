/**
 * Поломка при замене и сдаче в ремонт (22.10) — проверка сервера.
 * ЗАПУСКАТЬ В ПЕСОЧНИЦЕ (копия базы превью без ключа директора): замена и
 * сдача «в ремонт» на настоящем превью требуют ключ, а ключ мы не подделываем.
 *   ssh -L 4999:127.0.0.1:4999 … ;  SHOT_API=http://localhost:4999 SHOTBOT_PASS=… \
 *     node scripts/shots/api-test-breakdown.mjs
 */
const API = process.env.SHOT_API ?? "http://localhost:4999";
const TEST_SCOOTER = 74;
const CLIENT_ID = 15;
const login = await fetch(API + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ login: "shotbot", password: process.env.SHOTBOT_PASS, remember: true }),
});
const cookie = /hulk_session=([^;]+)/.exec(login.headers.get("set-cookie") ?? "")?.[1];
if (!cookie) {
  console.log("✗ вход", login.status);
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
const keySet = (await call("GET", "/api/approvals/status")).data?.keySet;
ok(keySet === false, "это песочница: ключ директора не задан");
if (keySet !== false) process.exit(1);

// список поломок пишется общим PUT (разрешённая настройка)
const list = await call("PUT", "/api/app-settings/breakdown_reasons", {
  value: JSON.stringify(["Не заводится", "Перегрев", "Тормоза", "ТЕСТ стучит двигатель"]),
});
ok(list.status === 200, "список поломок сохраняется", `статус ${list.status}`);

const scooters = (await call("GET", "/api/scooters")).data;
const rentalsAll = (await call("GET", "/api/rentals")).data;
const busy = new Set((rentalsAll.items ?? rentalsAll).filter((r) => r.status === "active").map((r) => r.scooterId));
const target = (scooters.items ?? scooters).find(
  (s) => s.baseStatus === "rental_pool" && !s.archivedAt && s.id !== TEST_SCOOTER && !busy.has(s.id),
);
ok(!!target, "свободный скутер", target?.name);
const s74 = (await call("GET", `/api/scooters/${TEST_SCOOTER}`)).data;

const start = new Date();
const rid = (
  await call("POST", "/api/rentals", {
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
    note: "ТЕСТ поломки (песочница)",
    allowSecondForClient: true,
  })
).data?.id;
ok(!!rid, "тестовая аренда", `#${rid}`);

// 1) замена «Поломка: Перегрев», снятый — в ремонт
const sw = await call("POST", `/api/rentals/${rid}/swap-scooter`, {
  newScooterId: target.id,
  oldScooterStatus: "repair",
  reasonCategory: "breakdown",
  breakdownReason: "Перегрев",
  prevScooterMileage: s74.mileage ?? 0,
});
ok(sw.status === 200, "замена с поломкой прошла", `статус ${sw.status}`);
const jobs74 = (await call("GET", `/api/repair-jobs?scooterId=${TEST_SCOOTER}`)).data;
const j74 = (jobs74.items ?? jobs74).find((j) => j.status === "in_progress");
ok(!!j74 && j74.breakdownReason === "Перегрев" && j74.rentalId === rid, "у снятого скутера открыт ремонт с поломкой", j74 ? `«${j74.breakdownReason}», аренда #${j74.rentalId}` : "нет");
const act = ((await call("GET", `/api/activity?entity=rental&entityId=${rid}&limit=10`)).data.items ?? []).find((x) => x.action === "scooter_swapped");
ok(/Поломка: Перегрев/.test(act?.summary ?? ""), "в хронологии аренды — «Поломка: Перегрев»", act?.summary?.slice(0, 120));

// 2) сдача «в ремонт» с поломкой
const c = await call("POST", `/api/rentals/${rid}/complete`, {
  dateActual: new Date().toISOString().slice(0, 10),
  conditionOk: true,
  equipmentOk: true,
  depositReturned: true,
  returnReason: "ТЕСТ",
  scooterNextStatus: "repair",
  breakdownReason: "Не заводится",
  mileageAtReturn: target.mileage ?? 0,
});
ok(c.status === 200, "сдача «в ремонт» прошла", `статус ${c.status}`);
const jt = ((await call("GET", `/api/repair-jobs?scooterId=${target.id}`)).data.items ?? []).find((j) => j.status === "in_progress");
ok(!!jt && jt.breakdownReason === "Не заводится", "у сданного скутера открыт ремонт с поломкой", jt ? `«${jt.breakdownReason}»` : "нет");
const done = ((await call("GET", `/api/activity?entity=rental&entityId=${rid}&limit=10`)).data.items ?? []).find((x) => x.action === "completed");
ok(/в ремонт: Не заводится/.test(done?.summary ?? ""), "в хронологии — «в ремонт: Не заводится»", done?.summary?.slice(0, 140));

console.log(fails ? `\nПРОВАЛОВ: ${fails}` : "\nВсё сходится");
process.exit(fails ? 1 : 0);
