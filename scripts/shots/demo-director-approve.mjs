/**
 * Как директор видит запрос на подтверждение (22.10) — ТОЛЬКО песочница:
 * фронт `node scripts/shots/dev-sandbox.mjs` (:5173) → API песочницы (:4999).
 * Администратор запускает две защищённые операции и отправляет директору,
 * директор открывает CRM с телефона — запрос всплывает сам.
 *   DIR_PASS=… SB_ADMIN_PASS=… node scripts/shots/demo-director-approve.mjs
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "scripts/shots/out");
const BASE = "http://localhost:5173";
const BRAVE = "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

async function apiLogin(login, password) {
  const r = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password, remember: true }),
  });
  const m = /hulk_session=([^;]+)/.exec(r.headers.get("set-cookie") ?? "");
  if (!m) throw new Error(`вход ${login}: ${r.status}`);
  return m[1];
}
const get = async (cookie, url) =>
  (await fetch(BASE + url, { headers: { Cookie: `hulk_session=${cookie}` } })).json();

const browser = await puppeteer.launch({ executablePath: BRAVE, headless: "new", args: ["--no-first-run"] });
async function openAs(cookie, { width = 1440, height = 900, dpr = 2, mobile = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("hulk-release-tour-skip", "1");
    const now = new Date().toISOString();
    localStorage.setItem("hulk-seen-applications", JSON.stringify(Array.from({ length: 400 }, (_, i) => ({ id: i + 1, seenAt: now }))));
  });
  await page.setCookie({ name: "hulk_session", value: cookie, domain: "localhost", path: "/" });
  await page.goto(BASE + (mobile ? "/?mobile=1" : "/"), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.length > 200, { timeout: 40000 });
  await sleep(2500);
  return page;
}
const clickText = (page, re) =>
  page.evaluate((src) => {
    const r = new RegExp(src);
    const b = [...document.querySelectorAll("button")].filter((x) => x.getBoundingClientRect().width > 0).find((x) => r.test((x.textContent || "").trim()));
    b?.click();
    return !!b;
  }, re.source);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 90 });

const dirCookie = await apiLogin("shotbot", process.env.DIR_PASS);
const admCookie = await apiLogin("sb_admin", process.env.SB_ADMIN_PASS);

// данные: свободный скутер и принятый платёж
const sc = await get(dirCookie, "/api/scooters");
const target = (sc.items ?? sc).find((s) => s.baseStatus === "rental_pool" && !s.archivedAt);
const pays = await get(dirCookie, "/api/payments?limit=200");
const pay = (pays.items ?? pays).find((p) => p.paid && p.amount > 500 && p.rentalId);
console.log("скутер", target?.name, "платёж", pay?.id, pay?.amount);

// ── администратор: две операции → «Отправить директору» ──
const adm = await openAs(admCookie);
const send = async (fn, file) => {
  await adm.evaluate(fn, { sid: target.id, pid: pay?.id, amt: pay ? Math.round(pay.amount / 2) : 0 });
  await adm.waitForFunction(() => /Отправить директору/.test(document.body.innerText), { timeout: 15000 });
  await sleep(600);
  if (file) await shot(adm, file);
  await clickText(adm, /^Отправить директору/);
  await sleep(1500);
};
await send(({ sid }) => {
  import("/src/lib/api.ts").then(({ api }) => api.patch(`/api/scooters/${sid}`, { baseStatus: "repair" }).catch(() => {}));
}, "appr-1-admin-gate.jpg");
await shot(adm, "appr-2-admin-waiting.jpg");
// второе окно: закрываем ожидание первого (запрос остаётся у директора)
const adm2 = await openAs(admCookie);
if (pay) {
  await adm2.evaluate(({ pid, amt }) => {
    import("/src/lib/api.ts").then(({ api }) => api.patch(`/api/payments/${pid}`, { amount: amt }).catch(() => {}));
  }, { pid: pay.id, amt: Math.round(pay.amount / 2) });
  await adm2.waitForFunction(() => /Отправить директору/.test(document.body.innerText), { timeout: 15000 });
  await sleep(500);
  await clickText(adm2, /^Отправить директору/);
  await sleep(1500);
}

// ── директор с телефона: запрос всплывает сам ──
const phone = await openAs(dirCookie, { width: 390, height: 844, dpr: 3, mobile: true });
await phone.waitForFunction(() => !!document.querySelector("[data-approvals-panel]"), { timeout: 30000 });
await sleep(1200);
await shot(phone, "appr-3-phone-panel.jpg");
// вторая карточка — прокрутить к ней
await phone.evaluate(() => document.querySelectorAll("[data-approval-card]")[1]?.scrollIntoView({ block: "start" }));
await sleep(600);
await shot(phone, "appr-4-phone-card2.jpg");
// «Отклонить…» → «Точно отклонить?»
await phone.evaluate(() => {
  const card = document.querySelectorAll("[data-approval-card]")[1] ?? document.querySelector("[data-approval-card]");
  [...card.querySelectorAll("button")].find((b) => /Отклонить…/.test(b.textContent || ""))?.click();
});
await sleep(600);
await shot(phone, "appr-5-phone-reject-confirm.jpg");
await phone.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => /Не отклонять/.test(b.textContent || ""))?.click();
});
await sleep(400);

// ── директор с компьютера: то же окно ──
const desk = await openAs(dirCookie);
await desk.waitForFunction(() => /Ждут? вашего решения/.test(document.body.innerText), { timeout: 30000 }).catch(() => {});
await clickText(desk, /Ждут решения/);
await sleep(1500);
await shot(desk, "appr-6-desktop-panel.jpg");

// подтверждаем первую — у администратора окно закрывается и действие проходит
await phone.evaluate(() => {
  const card = document.querySelector("[data-approval-card]");
  [...card.querySelectorAll("button")].find((b) => /^Подтвердить$/.test((b.textContent || "").trim()))?.click();
});
await sleep(4500);
await shot(phone, "appr-7-phone-after-approve.jpg");
await shot(adm, "appr-8-admin-done.jpg");

// вернуть: скутер в парк, второй запрос отклонить
await fetch(BASE + `/api/scooters/${target.id}`, {
  method: "PATCH",
  headers: { Cookie: `hulk_session=${dirCookie}`, "Content-Type": "application/json", "x-director-approval": "self" },
  body: JSON.stringify({ baseStatus: "rental_pool" }),
});
const left = await get(dirCookie, "/api/approvals?status=pending");
for (const r of left.items ?? []) {
  await fetch(BASE + `/api/approvals/${r.id}/reject`, {
    method: "POST",
    headers: { Cookie: `hulk_session=${dirCookie}`, "Content-Type": "application/json" },
    body: "{}",
  });
}
await browser.close();
console.log("готово");
