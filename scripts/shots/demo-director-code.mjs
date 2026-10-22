/**
 * Съёмка «меняющегося кода» (22.10) — ТОЛЬКО на песочнице:
 * фронт `node scripts/shots/dev-sandbox.mjs` (:5173) → API песочницы (:4999).
 * Кадры и видео кольца — в scripts/shots/out/code-*.
 *   DIR_PASS=… SB_ADMIN_PASS=… node scripts/shots/demo-director-code.mjs
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "scripts/shots/out");
const BASE = "http://localhost:5173";
const BRAVE = "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";
const VIDEO_S = Number(process.env.VIDEO_S ?? 34);
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

const browser = await puppeteer.launch({
  executablePath: BRAVE,
  headless: "new",
  args: ["--no-first-run", "--disable-extensions"],
});

async function openAs(cookie, { width = 1440, height = 900, dpr = 2, mobile = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("hulk-release-tour-skip", "1");
    const now = new Date().toISOString();
    localStorage.setItem(
      "hulk-seen-applications",
      JSON.stringify(Array.from({ length: 400 }, (_, i) => ({ id: i + 1, seenAt: now }))),
    );
  });
  if (cookie)
    await page.setCookie({ name: "hulk_session", value: cookie, domain: "localhost", path: "/" });
  await page.goto(BASE + (mobile ? "/?mobile=1" : "/"), { waitUntil: "domcontentloaded" });
  await page.waitForFunction((min) => document.body.innerText.length > min, { timeout: 40000 }, cookie ? 200 : 20);
  await sleep(2500);
  return page;
}

const clickText = (page, re) =>
  page.evaluate((src) => {
    const re = new RegExp(src);
    const b = [...document.querySelectorAll("button")].find((x) => re.test((x.textContent || "").trim()));
    b?.click();
    return !!b;
  }, re.source);

/** Видимая кнопка «Код» (в дереве может быть и скрытая копия шапки). */
async function clickCode(page) {
  const handles = await page.$$('button[title="Меняющийся код директора"]');
  for (const h of handles) {
    const box = await h.boundingBox();
    if (box && box.width > 0) {
      await h.click();
      break;
    }
  }
  await page.waitForFunction(() => !!document.querySelector("[data-director-code-sheet]"), { timeout: 8000 });
}

/** Защищённое действие из самого приложения — откроется окно подтверждения. */
const triggerGate = (page, scooterId) =>
  page.evaluate((id) => {
    import("/src/lib/api.ts").then(({ api }) =>
      api.patch(`/api/scooters/${id}`, { baseStatus: "repair" }).then(
        () => (window.__gate = "done"),
        (e) => (window.__gate = "fail:" + e.message),
      ),
    );
  }, scooterId);

const shotEl = async (page, selector, file, pad = 0) => {
  const box = await page.evaluate(
    (sel, pad) => {
      const el = typeof sel === "string" ? document.querySelector(sel) : null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.width + pad * 2, height: r.height + pad * 2 };
    },
    selector,
    pad,
  );
  if (!box) throw new Error("нет элемента " + selector);
  await page.screenshot({ path: path.join(OUT, file), clip: box, captureBeyondViewport: false });
};

const dirCookie = await apiLogin("shotbot", process.env.DIR_PASS);
const admCookie = await apiLogin("sb_admin", process.env.SB_ADMIN_PASS);

// свободный скутер для окна подтверждения
const sc = await (await fetch(BASE + "/api/scooters", { headers: { Cookie: `hulk_session=${dirCookie}` } })).json();
const target = (sc.items ?? sc).find((s) => s.baseStatus === "rental_pool" && !s.archivedAt);

// ── 1. Директор: шапка с кнопкой «Код» → окно с кольцом → видео ──
const dir = await openAs(dirCookie);
await dir.screenshot({ path: path.join(OUT, "code-1-header-director.png"), clip: { x: 0, y: 0, width: 1440, height: 90 } });
await clickCode(dir);
await sleep(1500);
await dir.screenshot({ path: path.join(OUT, "code-2-sheet.jpg"), type: "jpeg", quality: 90 });

// видео: кадры окна с кодом ~8 в секунду
const framesDir = path.join(OUT, "code-frames");
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir);
const sheet = await dir.evaluate(() => {
  const el = document.querySelector("[data-director-code-sheet]");
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
const t0 = Date.now();
let n = 0;
while (VIDEO_S > 0 && Date.now() - t0 < VIDEO_S * 1000) {
  await dir.screenshot({
    path: path.join(framesDir, `f${String(n++).padStart(4, "0")}.png`),
    clip: sheet,
    captureBeyondViewport: false,
  });
}
const fps = (n / ((Date.now() - t0) / 1000)).toFixed(2);
if (VIDEO_S > 0) {
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", fps, "-i", path.join(framesDir, "f%04d.png"),
  "-vf", "scale=600:-2:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-crf", "20", path.join(OUT, "code-ring.mp4")]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", fps, "-i", path.join(framesDir, "f%04d.png"),
  "-vf", "fps=8,scale=420:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer", path.join(OUT, "code-ring.gif")]);
console.log(`видео: ${n} кадров, ${fps} к/с`);
}
await dir.keyboard.press("Escape");
await dir.mouse.click(20, 450);
await sleep(600);

// ── 2. Директор: защищённое действие — одна кнопка ──
await triggerGate(dir, target.id);
await sleep(2000);
await dir.screenshot({ path: path.join(OUT, "code-3-gate-director.jpg"), type: "jpeg", quality: 90 });
await dir.evaluate(() => document.querySelector('[aria-label="Отмена"]')?.click());
await sleep(800);

// ── 3. Директор: настройки → «Защита директора» ──
await dir.evaluate(() => window.dispatchEvent(new CustomEvent("hulk:navigate", { detail: { route: "settings" } })));
await sleep(2500);
await dir.evaluate(() => {
  const h = [...document.querySelectorAll("div")].find((d) => d.textContent?.trim() === "Защита директора");
  h?.closest("section")?.scrollIntoView({ block: "start" });
  window.scrollBy(0, -20);
});
await sleep(1200);
await dir.screenshot({ path: path.join(OUT, "code-4-settings.jpg"), type: "jpeg", quality: 90 });
// коды восстановления: создать и показать (как на GitHub)
await clickText(dir, /^Создать новые коды|^Создать коды восстановления/);
await sleep(500);
await dir.type('input[autocomplete="current-password"]', process.env.DIR_PASS, { delay: 20 });
await clickText(dir, /^Создать коды$/);
await dir.waitForFunction(() => document.body.textContent.includes("больше они не покажутся"), { timeout: 15000 });
await dir.evaluate(() => {
  const h = [...document.querySelectorAll("div")].find((d) => d.textContent?.trim() === "Коды восстановления пароля");
  [...document.querySelectorAll("div")]
    .find((d) => d.textContent?.trim() === "Сохраните коды сейчас — больше они не покажутся.")
    ?.parentElement?.scrollIntoView({ block: "center" });
});
await sleep(800);
await dir.screenshot({ path: path.join(OUT, "code-4b-recovery-codes.jpg"), type: "jpeg", quality: 90 });

// ── 4. Администратор: нет кнопки «Код», окно с вводом кода ──
const adm = await openAs(admCookie);
await adm.screenshot({ path: path.join(OUT, "code-5-header-admin.png"), clip: { x: 0, y: 0, width: 1440, height: 90 } });
await triggerGate(adm, target.id);
await sleep(2000);
await adm.screenshot({ path: path.join(OUT, "code-6-gate-admin.jpg"), type: "jpeg", quality: 90 });
// директор диктует — берём текущий код из его аккаунта
let code = await (await fetch(BASE + "/api/approvals/code", { headers: { Cookie: `hulk_session=${dirCookie}` } })).json();
if (code.endsAt - code.serverNow < 4000) {
  await sleep(code.endsAt - code.serverNow + 500);
  code = await (await fetch(BASE + "/api/approvals/code", { headers: { Cookie: `hulk_session=${dirCookie}` } })).json();
}
await adm.type('input[inputmode="numeric"]', code.code.slice(0, 5), { delay: 90 });
await adm.screenshot({ path: path.join(OUT, "code-7-gate-admin-typing.jpg"), type: "jpeg", quality: 90 });
await adm.type('input[inputmode="numeric"]', code.code.slice(5), { delay: 90 });
await sleep(2500);
const gateResult = await adm.evaluate(() => window.__gate);
console.log("администратор ввёл код", code.code, "→", gateResult);
await adm.screenshot({ path: path.join(OUT, "code-8-admin-done.jpg"), type: "jpeg", quality: 90 });
// вернуть скутер в парк — директором, одним нажатием
await fetch(BASE + `/api/scooters/${target.id}`, {
  method: "PATCH",
  headers: { Cookie: `hulk_session=${dirCookie}`, "Content-Type": "application/json", "x-director-approval": "self" },
  body: JSON.stringify({ baseStatus: "rental_pool" }),
});

// ── 5. Экран входа: «Забыли пароль?» ──
const login = await openAs(null);
await login.evaluate(() => {
  [...document.querySelectorAll("button")].find((x) => /директор/i.test(x.textContent || ""))?.click();
});
await sleep(1200);
await login.screenshot({ path: path.join(OUT, "code-9-login.jpg"), type: "jpeg", quality: 90 });
await clickText(login, /^Забыли пароль\?$/);
await sleep(900);
await login.screenshot({ path: path.join(OUT, "code-10-recover.jpg"), type: "jpeg", quality: 90 });

// ── 6. Телефон: кнопка в шапке и окно снизу ──
const phone = await openAs(dirCookie, { width: 390, height: 844, dpr: 3, mobile: true });
await phone.screenshot({ path: path.join(OUT, "code-11-phone-header.jpg"), type: "jpeg", quality: 90 });
await clickCode(phone);
await sleep(1500);
await phone.screenshot({ path: path.join(OUT, "code-12-phone-sheet.jpg"), type: "jpeg", quality: 90 });

await browser.close();
console.log("готово");
