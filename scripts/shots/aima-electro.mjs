/**
 * Шаг прод-релиза: модель отмечают «электро» — её техника переезжает в ряд
 * электро. На превью проверяем на тестовой модели «AIMA ТЕСТ».
 *   SHOTBOT_PASS=… node scripts/shots/aima-electro.mjs
 */
const API = process.env.SHOT_API ?? "https://api-preview.104-128-128-96.sslip.io";
const login = await fetch(API + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ login: "shotbot", password: process.env.SHOTBOT_PASS, remember: true }),
});
const cookie = /hulk_session=([^;]+)/.exec(login.headers.get("set-cookie") ?? "")?.[1];
const call = async (m, u, b) => {
  const r = await fetch(API + u, {
    method: m,
    headers: { Cookie: `hulk_session=${cookie}`, ...(b ? { "Content-Type": "application/json" } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });
  const t = await r.text();
  let d = t;
  try { d = JSON.parse(t); } catch {}
  return { status: r.status, data: d };
};
let fails = 0;
const ok = (c, l, x = "") => { console.log(`${c ? "✓" : "✗"} ${l}${x ? " — " + x : ""}`); if (!c) fails++; };

const models = (await call("GET", "/api/scooter-models")).data.items;
let m = models.find((x) => x.name === "AIMA ТЕСТ");
if (!m) {
  const r = await call("POST", "/api/scooter-models", { name: "AIMA ТЕСТ", forRent: true, note: "ТЕСТ shotbot: правки 7.0, п.5 — перевод модели в электро" });
  m = r.data.item ?? r.data;
  ok(!!m?.id, "модель «AIMA ТЕСТ» заведена (бензин)", String(r.status));
}
ok(m.isElectric === false, "модель пока не электро");
let all = (await call("GET", "/api/scooters")).data.items;
let sc = all.find((s) => s.modelId === m.id && !s.archivedAt);
if (!sc) {
  const r = await call("POST", "/api/scooters", { name: "AIMA ТЕСТ 1", model: "jog", modelId: m.id, baseStatus: "rental_pool", note: "ТЕСТ shotbot" });
  sc = r.data;
  ok(r.status === 201, "техника заведена в арендный парк", `№${sc?.rentalSlot} ряд ${sc?.slotPool}`);
}
const before = { slot: sc.rentalSlot, pool: sc.slotPool };
const slotsBefore = (await call("GET", "/api/scooters/slots")).data;
const r = await call("PATCH", `/api/scooter-models/${m.id}`, { isElectric: true });
ok(r.status === 200, "модель отмечена «электро»", String(r.status));
const after = (await call("GET", `/api/scooters/${sc.id}`)).data;
ok(after.slotPool === "electric", "техника в ряду электро", `был ${before.pool} №${before.slot} → стал ${after.slotPool} №${after.rentalSlot}`);
ok(after.exRentalSlot === before.slot, "прежний номер сохранён как «бывший»", `бывший №${after.exRentalSlot}`);
const slots = (await call("GET", "/api/scooters/slots")).data;
ok(slots.electric.total >= after.rentalSlot, "номеров в ряду электро хватает", `электро всего ${slots.electric.total}, бензин ${slots.total} (было ${slotsBefore.total})`);
const j = await call("GET", `/api/activity?entity=model&entityId=${m.id}&limit=5`);
const line = (j.data.items ?? []).map((x) => x.summary).find((s) => /ряд электро|электро:/i.test(s));
ok(!!line, "запись в журнале", line ?? "нет");
console.log(fails ? `\n✗ провалов: ${fails}` : "\n✓ всё сходится");
