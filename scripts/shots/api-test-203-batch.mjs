/**
 * Правка партии 2.0.3 — проверка API на ПЕСОЧНИЦЕ (копия базы превью без
 * ключа директора, см. отчёт), тестовая партия «ТЕСТ партия shotbot».
 *   SHOT_API=http://localhost:4999 SHOTBOT_PASS=… node scripts/shots/api-test-203-batch.mjs
 */
import fs from "node:fs";

const API = process.env.SHOT_API ?? "http://localhost:4999";
const { ids } = JSON.parse(fs.readFileSync("scripts/shots/out/v203-test.json", "utf8"));
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
  let data = null;
  try {
    data = JSON.parse(t);
  } catch {
    data = t;
  }
  return { status: r.status, data };
};
const units = async () => {
  const r = await call("GET", "/api/scooters?includeArchived=1");
  return r.data.items.filter((s) => ids.includes(s.id)).sort((a, b) => a.id - b.id);
};
ok(!!cookie, "вход shotbot");

let u = await units();
ok(u.length === 4 && u.every((s) => s.purchaseBatch === "ТЕСТ партия shotbot"), "тестовая партия на месте", u.map((s) => s.baseStatus).join(","));
const BATCH = "ТЕСТ партия shotbot";

// 1. Номер, дата, закуп — у всех
let r = await call("POST", "/api/scooters/batch/edit", {
  ids,
  batch: BATCH,
  rename: "ТЕСТ партия shotbot 2",
  purchaseDate: "2026-09-12",
  purchasePrice: 58000,
});
ok(r.status === 200 && r.data.changed === 4, "номер, дата, закуп: изменены у 4", JSON.stringify(r.data).slice(0, 120));
u = await units();
ok(u.every((s) => s.purchaseBatch === "ТЕСТ партия shotbot 2" && s.purchaseDate === "2026-09-12" && s.purchasePrice === 58000), "в карточках — новые значения");

// 2. Старое название — «партию изменили»
r = await call("POST", "/api/scooters/batch/edit", { ids, batch: BATCH, purchaseDate: "2026-09-13" });
ok(r.status === 409 && r.data.error === "batch_changed", "старое название партии → 409", r.data.message);
// 3. Не вся партия в ids — тоже 409
r = await call("POST", "/api/scooters/batch/edit", { ids: ids.slice(0, 3), batch: "ТЕСТ партия shotbot 2", purchaseDate: "2026-09-13" });
ok(r.status === 409 && r.data.error === "batch_changed", "окно видит не всю партию → 409");

// 4. Двое — на продажу с ценой
r = await call("POST", "/api/scooters/batch/edit", {
  ids,
  batch: "ТЕСТ партия shotbot 2",
  status: { to: "for_sale", ids: ids.slice(0, 2) },
  salePrice: 95000,
});
ok(r.status === 200 && r.data.statusChanged === 2, "двое на продажу", JSON.stringify(r.data).slice(0, 160));
u = await units();
ok(u[0].baseStatus === "for_sale" && u[1].baseStatus === "for_sale" && u[2].baseStatus === "ready", "статусы: 2 на витрине, 2 не распределены");
ok(u[0].salePrice === 95000 && u[1].salePrice === 95000 && u[2].salePrice == null, "цена 95 000 — только у тех, кто на витрине");

// 5. Один — в аренду: номер выдан
const slotsBefore = (await call("GET", "/api/scooters/slots")).data;
r = await call("POST", "/api/scooters/batch/edit", {
  ids,
  batch: "ТЕСТ партия shotbot 2",
  status: { to: "rental_pool", ids: [ids[2]] },
});
u = await units();
ok(r.status === 200 && u[2].baseStatus === "rental_pool" && u[2].rentalSlot === slotsBefore.free[0], "в аренду — первый свободный номер", `номер ${u[2].rentalSlot}, свободные были ${slotsBefore.free.slice(0, 3).join(",")}`);

// 6. Из аренды — на продажу: номер освободился и запомнился
const slot = u[2].rentalSlot;
r = await call("POST", "/api/scooters/batch/edit", {
  ids,
  batch: "ТЕСТ партия shotbot 2",
  status: { to: "for_sale", ids: [ids[2]] },
});
u = await units();
ok(r.status === 200 && u[2].rentalSlot == null && u[2].exRentalSlot === slot, "из аренды на продажу — номер освободился", `был ${slot}, ex ${u[2].exRentalSlot}`);

// 6б. Раскладка за один раз: одну — в выкуп, другую — «не решили»
r = await call("POST", "/api/scooters/batch/edit", {
  ids,
  batch: "ТЕСТ партия shotbot 2",
  moves: [
    { to: "buyout", ids: [ids[2]] },
    { to: "ready", ids: [ids[1]] },
  ],
});
u = await units();
ok(r.status === 200 && r.data.statusChanged === 2 && u[2].baseStatus === "buyout" && u[1].baseStatus === "ready", "раскладка по двум статусам одним запросом", `${u.map((s) => s.baseStatus).join(",")}`);
r = await call("POST", "/api/scooters/batch/edit", {
  ids,
  batch: "ТЕСТ партия shotbot 2",
  moves: [
    { to: "buyout", ids: [ids[1]] },
    { to: "for_sale", ids: [ids[1]] },
  ],
});
ok(r.status === 400, "одна единица в двух направлениях — 400");

// 7. Проданная — статус не меняется
await call("PATCH", `/api/scooters/${ids[3]}`, { baseStatus: "sold" });
r = await call("POST", "/api/scooters/batch/edit", {
  ids,
  batch: "ТЕСТ партия shotbot 2",
  status: { to: "ready", ids: [ids[3]] },
});
ok(r.status === 409 && r.data.error === "rows" && r.data.rows?.[0]?.id === ids[3], "проданная — отказ с причиной", r.data.message);

// 8. «Уже там» — отказ
r = await call("POST", "/api/scooters/batch/edit", {
  ids,
  batch: "ТЕСТ партия shotbot 2",
  status: { to: "for_sale", ids: [ids[0]] },
});
ok(r.status === 409 && /уже/.test(r.data.message), "уже на продаже — отказ", r.data.message);

// 9. Статус чужой единицы — 400
r = await call("POST", "/api/scooters/batch/edit", {
  ids,
  batch: "ТЕСТ партия shotbot 2",
  status: { to: "ready", ids: [1] },
});
ok(r.status === 400, "статус единицы из другой партии — 400");

// 10. Объединение: новое имя = имя другой партии
const other = (await call("GET", "/api/scooters?includeArchived=1")).data.items.find(
  (s) => s.purchaseBatch && !ids.includes(s.id) && !s.deletedAt,
);
if (other) {
  r = await call("POST", "/api/scooters/batch/edit", { ids, batch: "ТЕСТ партия shotbot 2", rename: other.purchaseBatch.toUpperCase() });
  u = await units();
  ok(r.status === 200 && u.every((s) => s.purchaseBatch === other.purchaseBatch.toUpperCase()), "переименование в имя другой партии — объединились (регистр не важен)");
  const back = await call("POST", "/api/scooters/batch/edit", {
    ids: [...ids, ...(await call("GET", "/api/scooters?includeArchived=1")).data.items.filter((s) => s.purchaseBatch && s.purchaseBatch.toLowerCase() === other.purchaseBatch.toLowerCase() && !ids.includes(s.id)).map((s) => s.id)],
    batch: other.purchaseBatch.toUpperCase(),
    purchaseDate: "2026-09-12",
  });
  ok(back.status === 200, "объединённая партия правится одним запросом (все единицы)", `изменено ${back.data.changed}`);
}

// 11. Журнал
r = await call("GET", "/api/activity?limit=80");
const mine = (r.data.items ?? []).filter((a) => a.entity === "scooter" && ids.includes(a.entityId) && a.meta?.source === "batch_edit");
ok(mine.length >= 8, "журнал: записи правки партии у единиц", `${mine.length} записей`);
const st = mine.find((a) => a.action === "status_changed" && /арендный номер/.test(a.summary));
ok(!!st, "журнал: «статус … → … · арендный номер N»", st?.summary);

console.log(fails ? `ПРОВАЛОВ: ${fails}` : "ВСЁ ПРОШЛО");
process.exit(fails ? 1 : 0);
