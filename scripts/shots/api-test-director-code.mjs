/**
 * Меняющийся код директора, подтверждение одним нажатием, коды
 * восстановления (22.10) — проверка сервера.
 * ЗАПУСКАТЬ ТОЛЬКО В ПЕСОЧНИЦЕ (копия базы превью + тестовый администратор
 * sb_admin, которого нет нигде, кроме копии): тест включает код и меняет
 * пароль shotbot через код восстановления.
 *   ssh -L 4999:127.0.0.1:4999 … ;  SHOT_API=http://localhost:4999 \
 *     SHOTBOT_PASS=… SB_ADMIN_PASS=… node scripts/shots/api-test-director-code.mjs
 */
const API = process.env.SHOT_API ?? "http://localhost:4999";
let fails = 0;
const ok = (c, label, extra = "") => {
  console.log(`${c ? "✓" : "✗"} ${label}${extra ? " — " + extra : ""}`);
  if (!c) fails++;
};
async function login(loginName, password) {
  const r = await fetch(API + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: loginName, password, remember: true }),
  });
  return /hulk_session=([^;]+)/.exec(r.headers.get("set-cookie") ?? "")?.[1] ?? null;
}
const caller = (cookie) => async (method, url, body, headers = {}) => {
  const r = await fetch(API + url, {
    method,
    headers: {
      Cookie: `hulk_session=${cookie}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let data = t;
  try {
    data = JSON.parse(t);
  } catch {}
  return { status: r.status, data };
};

const dirCookie = await login("shotbot", process.env.SHOTBOT_PASS);
const admCookie = await login("sb_admin", process.env.SB_ADMIN_PASS);
ok(!!dirCookie && !!admCookie, "вход директором (shotbot, создатель) и тестовым администратором");
if (!dirCookie || !admCookie) process.exit(1);
const dir = caller(dirCookie);
const adm = caller(admCookie);

// 1) статус: кто директор
const sd = (await dir("GET", "/api/approvals/status")).data;
const sa = (await adm("GET", "/api/approvals/status")).data;
ok(sd.isDirector === true && sa.isDirector === false, "статус различает директора и администратора");

// 2) администратор не может ни включить код, ни увидеть его, ни сменить ключ
ok((await adm("POST", "/api/approvals/code/enable", {})).status === 403, "администратор не включает код");
ok((await adm("POST", "/api/approvals/key", { currentKey: "x", newKey: "abcd" })).status === 403, "администратор не меняет ключ");

// 3) директор включает код
ok((await dir("POST", "/api/approvals/code/enable", {})).status === 200, "директор включил меняющийся код");
ok((await dir("GET", "/api/approvals/status")).data.mode === "code", "режим — код");
ok((await adm("GET", "/api/approvals/code")).status === 403, "администратор код НЕ получает");
const c1 = (await dir("GET", "/api/approvals/code")).data;
ok(/^\d{6}$/.test(c1.code) && c1.period === 30 && c1.endsAt > c1.serverNow, "директор получает код", `${c1.code}, до смены ${Math.round((c1.endsAt - c1.serverNow) / 1000)} с`);
const hidden = await adm("GET", "/api/app-settings/director_totp_secret");
const all = (await adm("GET", "/api/app-settings")).data.items ?? [];
ok(hidden.status === 404 && !all.some((x) => x.key.startsWith("director_")), "секрет кода не читается через настройки");

// 4) защищённое действие администратором — смена категории скутера
const scooters = (await adm("GET", "/api/scooters")).data;
const rentals = (await adm("GET", "/api/rentals")).data;
const busy = new Set((rentals.items ?? rentals).filter((r) => r.status === "active").map((r) => r.scooterId));
const target = (scooters.items ?? scooters).find((s) => s.baseStatus === "rental_pool" && !s.archivedAt && !busy.has(s.id));
ok(!!target, "свободный скутер для проверки", target?.name);
const patch = (h) => adm("PATCH", `/api/scooters/${target.id}`, { baseStatus: "repair" }, h);
const p0 = await patch({});
ok(p0.status === 428, "без подтверждения — 428", `статус ${p0.status}`);
const pSelf = await patch({ "x-director-approval": "self" });
ok(pSelf.status === 428, "администратор не может выдать себя за директора (self)", `статус ${pSelf.status}`);
const wrong = await adm("POST", "/api/approvals/verify", { code: "000000", action: "scooter_status_change" });
ok(wrong.status === 403 && wrong.data.error === "wrong_code", "неверный код отклонён", wrong.data.message);
const oldKey = await adm("POST", "/api/approvals/verify", { key: "любой-старый-ключ", action: "scooter_status_change" });
ok(oldKey.status === 403, "постоянный ключ в режиме кода не принимается");
// код окна мог смениться — берём свежий
let cur = (await dir("GET", "/api/approvals/code")).data;
if (cur.endsAt - cur.serverNow < 3000) {
  await new Promise((r) => setTimeout(r, cur.endsAt - cur.serverNow + 400));
  cur = (await dir("GET", "/api/approvals/code")).data;
}
const v = await adm("POST", "/api/approvals/verify", { code: cur.code, action: "scooter_status_change" });
ok(v.status === 200 && !!v.data.pass, "верный код → разрешение", `код ${cur.code}`);
const reuse = await adm("POST", "/api/approvals/verify", { code: cur.code, action: "scooter_status_change" });
ok(reuse.status === 403 && reuse.data.error === "code_used", "тот же код второй раз — отказ", reuse.data.message);
const p1 = await patch({ "x-director-approval": `pass:${v.data.pass}` });
ok(p1.status === 200 && p1.data.baseStatus === "repair", "действие выполнено по коду", `статус ${p1.status}`);

// 5) директор сам — одно нажатие
const back = await dir("PATCH", `/api/scooters/${target.id}`, { baseStatus: "rental_pool" }, { "x-director-approval": "self" });
ok(back.status === 200 && back.data.baseStatus === "rental_pool", "директор подтвердил одним нажатием (self)", `статус ${back.status}`);

// 6) запрос директору: администратор просит, директор жмёт «Подтвердить» без ключа
const req = (await adm("POST", "/api/approvals", { action: "scooter_status_change", summary: "ТЕСТ песочницы: перенос в ремонт" })).data;
ok((await adm("POST", `/api/approvals/${req.id}/approve`, {})).status === 403, "администратор сам свой запрос не подтвердит");
const ap = await dir("POST", `/api/approvals/${req.id}/approve`, {});
ok(ap.status === 200 && ap.data.status === "approved", "директор подтвердил запрос одной кнопкой");
const p2 = await patch({ "x-director-approval": `req:${req.id}` });
ok(p2.status === 200, "действие по подтверждённому запросу выполнено");
const p3 = await adm("PATCH", `/api/scooters/${target.id}`, { baseStatus: "rental_pool" }, { "x-director-approval": `req:${req.id}` });
ok(p3.status === 428, "повторно тем же запросом — нельзя");
await dir("PATCH", `/api/scooters/${target.id}`, { baseStatus: "rental_pool" }, { "x-director-approval": "self" });

// 7) журнал
const act = ((await dir("GET", "/api/activity?limit=40")).data.items ?? []).map((x) => x.action);
ok(act.includes("director_code_enabled") && act.includes("director_code_wrong"), "включение кода и неверные попытки — в журнале");

// 8) коды восстановления
ok((await adm("GET", "/api/auth/recovery-codes")).status === 403, "администратору коды восстановления недоступны");
ok((await dir("POST", "/api/auth/recovery-codes", { password: "не-тот" })).status === 403, "без верного пароля коды не создать");
const rc = await dir("POST", "/api/auth/recovery-codes", { password: process.env.SHOTBOT_PASS });
ok(rc.status === 200 && rc.data.codes.length === 10, "создано 10 кодов", rc.data.codes?.[0]);
const st = (await dir("GET", "/api/auth/recovery-codes")).data;
ok(st.left === 10 && st.total === 10, "статус: осталось 10 из 10");
const badRec = await fetch(API + "/api/auth/recover", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ login: "shotbot", code: "aaaaa-bbbbb", newPassword: "Sandbox-New-2210" }),
});
ok(badRec.status === 403, "чужой код не подходит");
const code0 = rc.data.codes[0].toUpperCase().replace("-", " ");
const rec = await fetch(API + "/api/auth/recover", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ login: "shotbot", code: code0, newPassword: "Sandbox-New-2210" }),
});
const recBody = await rec.json();
ok(rec.status === 200 && recBody.left === 9, "пароль восстановлен кодом (регистр и пробел не мешают)", `осталось ${recBody.left}`);
ok((await dir("GET", "/api/approvals/status")).status === 401, "прежний вход директора сброшен");
ok(!(await login("shotbot", process.env.SHOTBOT_PASS)), "старый пароль больше не подходит");
ok(!!(await login("shotbot", "Sandbox-New-2210")), "новый пароль подходит");
const again = await fetch(API + "/api/auth/recover", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ login: "shotbot", code: rc.data.codes[0], newPassword: "Sandbox-Other-2210" }),
});
ok(again.status === 403, "тот же код второй раз — отказ");

console.log(fails ? `\nПРОВАЛОВ: ${fails}` : "\nВсё сходится");
process.exit(fails ? 1 : 0);
