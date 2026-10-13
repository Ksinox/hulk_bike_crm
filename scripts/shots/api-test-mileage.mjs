/**
 * Пробег при возврате (баг 13.10) — живая проверка сервера на превью.
 *
 * Сценарий заказчика: при приёмке ввели пробег, «система приняла», а у
 * следующего клиента пробег старый. Корень — опечатка с лишними цифрами
 * (45 674 567 км), после которой любой честный пробег молча отбрасывался.
 *
 * Проверяем на своём тестовом скутере «AIMA ТЕСТ 1» и аренде с суммой 0
 * (в выручку не попадает), в конце возвращаем пробег скутера как был:
 *   1) пробег больше 1 000 000 км не принимается (400);
 *   2) обычный рост — записывается;
 *   3) меньше прежнего БЕЗ отметки — не записывается (как раньше);
 *   4) меньше прежнего С отметкой «исправление» — записывается,
 *      в хронологии скутера запись «Пробег исправлен».
 *
 *   SHOTBOT_PASS=… node scripts/shots/api-test-mileage.mjs
 */
const API = process.env.SHOT_API ?? "https://api-preview.104-128-128-96.sslip.io";
const SCOOTER_ID = Number(process.env.SCOOTER_ID ?? 74); // «AIMA ТЕСТ 1»
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

const scooterMileage = async () => (await call("GET", `/api/scooters/${SCOOTER_ID}`)).data?.mileage;
const today = new Date().toISOString().slice(0, 10);

/** Тестовая аренда на сутки с суммой 0 — в выручку не идёт. */
const newRental = async () => {
  const start = new Date();
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  const r = await call("POST", "/api/rentals", {
    clientId: CLIENT_ID,
    scooterId: SCOOTER_ID,
    status: "active",
    tariffPeriod: "short",
    rate: 1,
    deposit: 0,
    startAt: start.toISOString(),
    endPlannedAt: end.toISOString(),
    days: 1,
    sum: 0,
    paymentMethod: "cash",
    note: "ТЕСТ пробег shotbot — проверка исправления 13.10, можно удалить",
    allowSecondForClient: true,
  });
  return r.data?.id ?? r.data?.rental?.id ?? null;
};
const complete = (id, extra) =>
  call("POST", `/api/rentals/${id}/complete`, {
    dateActual: today,
    conditionOk: true,
    equipmentOk: true,
    depositReturned: true,
    returnReason: "ТЕСТ",
    scooterNextStatus: "rental_pool",
    ...extra,
  });

const original = await scooterMileage();
console.log(`пробег тестового скутера до проверки: ${original}`);

// 1) лишние цифры
const r1 = await newRental();
ok(!!r1, "тестовая аренда создана", `#${r1}`);
const big = await complete(r1, { mileageAtReturn: 45_674_567 });
ok(big.status === 400, "пробег 45 674 567 км не принят", `статус ${big.status}`);

// 2) обычный рост
const grow = (original ?? 0) + 150;
const ok2 = await complete(r1, { mileageAtReturn: grow });
ok(ok2.status === 200, "завершение с нормальным пробегом", `статус ${ok2.status}`);
ok((await scooterMileage()) === grow, "пробег скутера обновился", `${grow} км`);

// 3) меньше без отметки — не трогаем
const r2 = await newRental();
const lower = grow - 30;
const s3 = await complete(r2, { mileageAtReturn: lower });
ok(s3.status === 200, "завершение с меньшим пробегом без отметки проходит", `статус ${s3.status}`);
ok((await scooterMileage()) === grow, "без отметки пробег НЕ уменьшился", `${await scooterMileage()} км`);

// 4) меньше с отметкой «исправление» — пишем и журналим
const r3 = await newRental();
const s4 = await complete(r3, { mileageAtReturn: lower, mileageCorrection: true });
ok(s4.status === 200, "завершение с исправлением", `статус ${s4.status}`);
ok((await scooterMileage()) === lower, "пробег исправлен на меньший", `${lower} км`);
const log = await call("GET", `/api/activity?entity=scooter&entityId=${SCOOTER_ID}&limit=10`);
const items = log.data?.items ?? log.data ?? [];
const corr = Array.isArray(items) ? items.find((x) => x.action === "mileage_corrected") : null;
ok(!!corr, "в хронологии скутера — «Пробег исправлен»", corr?.summary ?? "нет записи");

// уборка: вернуть пробег скутера как был
const back = await call("PATCH", `/api/scooters/${SCOOTER_ID}`, { mileage: original ?? 0 });
ok(back.status === 200 && (await scooterMileage()) === (original ?? 0), "пробег тестового скутера возвращён", `${original} км`);
console.log(`тестовые аренды: #${r1}, #${r2}, #${r3} (сумма 0, пометка «ТЕСТ пробег»)`);
console.log(fails ? `\nПРОВАЛОВ: ${fails}` : "\nВсё сходится");
process.exit(fails ? 1 : 0);
