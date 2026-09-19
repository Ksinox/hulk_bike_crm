/**
 * Диагностика (15.09): экран входа в проде «сам обновляется».
 * Режимы: LOOP_MODE=clean — без куки; LOOP_MODE=revoked — ответы API
 * подменяются на 401 session_revoked (как у старой сессии без sv).
 * Считаем перезагрузки (маркер на window), перемонтирование формы и запросы.
 */
import puppeteer from "puppeteer-core";

const BRAVE = "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";
const MODE = process.env.LOOP_MODE ?? "clean";
const BASE = process.env.LOOP_BASE ?? "https://crm.hulkbike.ru";
const browser = await puppeteer.launch({ executablePath: BRAVE, headless: "new" });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  let navigations = 0;
  page.on("framenavigated", (f) => f === page.mainFrame() && navigations++);
  const reqs = new Map();
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (!/^\/api\/|version\.json/.test(u.pathname)) return;
    const k = `${r.request().method()} ${u.pathname} ${r.status()}`;
    reqs.set(k, (reqs.get(k) ?? 0) + 1);
  });
  if (MODE === "revoked") {
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const u = new URL(req.url());
      const isApi = /^\/api\//.test(u.pathname) && !/^\/api\/auth\/(tiles|login)/.test(u.pathname);
      if (isApi && req.method() !== "OPTIONS") {
        req.respond({
          status: 401,
          contentType: "application/json",
          headers: { "Access-Control-Allow-Origin": BASE, "Access-Control-Allow-Credentials": "true" },
          body: JSON.stringify({ error: "session_revoked", reason: "update" }),
        });
      } else req.continue();
    });
  }
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 5000));
  await page.evaluate(() => (window.__probe = 1));
  // выбрать плитку «Директор» и начать ввод
  await page.evaluate(() => {
    const t = [...document.querySelectorAll("button, [role=button]")].find((b) => /Директор/.test(b.textContent || ""));
    t?.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  const snaps = [];
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => {
      // как открытие клавиатуры на телефоне: окно «вернулось в фокус»
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
      const p = document.querySelector("input[type=password]");
      if (p && !p.dataset.probe) p.dataset.probe = "1";
      if (p) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(p, (p.value || "") + "x");
        p.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 2500));
    snaps.push(
      await page.evaluate(() => {
        const p = document.querySelector("input[type=password]");
        return `${window.__probe ? "same-page" : "RELOADED"}/${p ? (p.dataset.probe ? "same-input" : "NEW-input") : "no-input"}/len=${p?.value.length ?? "-"}`;
      }),
    );
  }
  console.log(MODE, "навигаций после загрузки:", navigations - 1);
  console.log("снимки:", snaps.join(" | "));
  console.log("запросы:", JSON.stringify([...reqs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)));
} finally {
  await browser.close();
}
