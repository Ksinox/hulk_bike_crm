/**
 * Конвейер скриншотов для лендинга «Развитие» (и отчётов заказчику).
 *
 * Запускает системный Brave в headless, логинится на preview под тех-юзером
 * shotbot (director), выполняет сценарий и сохраняет PNG в
 * apps/web/public/progress/. Поддерживает кроп зон внимания (clip).
 *
 * Использование:
 *   node scripts/shots/shot.mjs scripts/shots/scenarios/<имя>.mjs
 *
 * Сценарий — ES-модуль, экспортирующий async run(page, ctx):
 *   ctx.shot(name, {clip})  — полный кадр или кроп в public/progress/<name>.png
 *   ctx.gotoRoute(route, extra) — навигация внутри SPA (hulk:navigate)
 *   ctx.sleep(ms)
 *
 * Пароль тех-юзера задаётся env SHOTBOT_PASS (не хардкодим в репо).
 */
import puppeteer from "puppeteer-core";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(ROOT, "apps/web/public/progress");
const BASE = process.env.SHOT_BASE ?? "https://crm-preview.104-128-128-96.sslip.io";
const LOGIN = process.env.SHOTBOT_LOGIN ?? "shotbot";
const PASS = process.env.SHOTBOT_PASS;
const BRAVE = "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";

if (!PASS) {
  console.error("SHOTBOT_PASS не задан");
  process.exit(1);
}
const scenarioPath = process.argv[2];
if (!scenarioPath) {
  console.error("Использование: node shot.mjs <scenario.mjs>");
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: BRAVE,
  headless: "new",
  args: ["--no-first-run", "--disable-extensions", "--window-size=1600,1000"],
  defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 2 },
});
try {
  const page = await browser.newPage();
  // Отключаем анимации — скриншоты стабильные, без полукадров.
  await page.evaluateOnNewDocument(() => {
    const s = document.createElement("style");
    s.textContent =
      "*,*::before,*::after{animation:none!important;transition:none!important}";
    document.addEventListener("DOMContentLoaded", () =>
      document.head.appendChild(s),
    );
  });

  // Логин Node-фетчем (вне браузера) → сессионную куку ставим напрямую:
  // headless блокирует third-party Set-Cookie при XHR crm→api.
  // SHOT_API — когда фронт поднят локально (снимаем «было» со старой
  // сборки), а данные берём с preview.
  const apiBase = process.env.SHOT_API ?? BASE.replace("crm-", "api-");
  const loginResp = await fetch(apiBase + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: LOGIN, password: PASS, remember: true }),
  });
  const setCookie = loginResp.headers.get("set-cookie") ?? "";
  const m = /hulk_session=([^;]+)/.exec(setCookie);
  if (loginResp.status !== 200 || !m) {
    console.error("Логин не удался:", loginResp.status, setCookie.slice(0, 80));
    process.exit(1);
  }
  await page.setCookie({
    name: "hulk_session",
    value: m[1],
    domain: new URL(apiBase).hostname,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "None",
  });
  // Профиль браузера чистый на каждый прогон → NewApplicationDetector
  // всплывал бы модалкой «Новая заявка» поверх любого сценария. Помечаем
  // все заявки «просмотренными» (id 1..200) до загрузки приложения.
  await page.evaluateOnNewDocument(() => {
    const now = new Date().toISOString();
    const arr = Array.from({ length: 200 }, (_, i) => ({
      id: i + 1,
      seenAt: now,
    }));
    localStorage.setItem("hulk-seen-applications", JSON.stringify(arr));
  });
  // domcontentloaded + ожидание текста: networkidle2 иногда не наступает —
  // приложение держит открытые запросы (поллинг заявок/уведомлений), и
  // навигация падала по 30-секундному таймауту на ровном месте.
  await page.goto(BASE + "/", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  // Локальный фронт (SHOT_BASE=localhost) не получает third-party куку —
  // тогда логинимся через форму теми же кредами.
  await page.waitForFunction(() => document.body.innerText.length > 40, {
    timeout: 30000,
  });
  const needsLogin = await page.evaluate(() =>
    /ВХОД В СИСТЕМУ/i.test(document.body.innerText),
  );
  if (needsLogin) {
    await page.evaluate(
      ({ login, pass }) => {
        const setV = (el, v) => {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value",
          ).set;
          setter.call(el, v);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        };
        const inputs = [...document.querySelectorAll("input")];
        const l = inputs.find((i) => i.type !== "password");
        const p = inputs.find((i) => i.type === "password");
        if (l) setV(l, login);
        if (p) setV(p, pass);
        const btn = [...document.querySelectorAll("button")].find((b) =>
          /Войти|Вход/i.test(b.textContent || ""),
        );
        btn?.click();
      },
      { login: LOGIN, pass: PASS },
    );
    await new Promise((r) => setTimeout(r, 4000));
  }
  await page.waitForFunction(
    () => document.body.innerText.length > 200,
    { timeout: 20000 },
  );

  const ctx = {
    base: BASE,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    async gotoRoute(route, extra = {}) {
      await page.evaluate(
        (route, extra) => {
          window.dispatchEvent(
            new CustomEvent("hulk:navigate", { detail: { route, ...extra } }),
          );
        },
        route,
        extra,
      );
      await ctx.sleep(1800);
    },
    async shot(name, opts = {}) {
      // Полные кадры — JPEG (в бандл идёт в разы легче), кропы — PNG (текст
      // чётче). SHOT_OUT=check — служебные кадры мимо public (не в бандл).
      const dir =
        process.env.SHOT_OUT === "check"
          ? path.join(ROOT, "scripts/shots/out")
          : OUT_DIR;
      fs.mkdirSync(dir, { recursive: true });
      const jpeg = opts.jpeg ?? !opts.clip;
      const file = path.join(dir, name + (jpeg ? ".jpg" : ".png"));
      // Дожидаемся загрузки всех картинок в кадре (лендинг с фото).
      await page
        .evaluate(() =>
          Promise.all(
            [...document.images]
              .filter((i) => !i.complete)
              .map((i) => new Promise((r) => ((i.onload = r), (i.onerror = r)))),
          ),
        )
        .catch(() => {});
      // captureBeyondViewport:false — ВАЖНО. По умолчанию Puppeteer ради
      // clip'а вне вьюпорта временно меняет метрики устройства, браузер
      // отдаёт resize, React-дерево перемонтируется: состояние экрана
      // слетает (сброшенный фильтр) и заново всплывают модалки (детектор
      // новой заявки). Из-за этого кадры получались «не про то».
      await page.screenshot({
        path: file,
        captureBeyondViewport: false,
        ...(jpeg ? { type: "jpeg", quality: 85 } : {}),
        ...(opts.clip ? { clip: opts.clip } : {}),
      });
      console.log("SHOT:", path.relative(ROOT, file));
    },
    page,
  };

  const mod = await import(pathToFileURL(path.resolve(scenarioPath)).href);
  await mod.run(page, ctx);
  console.log("OK");
} finally {
  await browser.close();
}
