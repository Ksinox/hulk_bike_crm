/**
 * Проверка дополнения «Халк Байк — мессенджеры» вживую.
 *
 * Запускает браузер с загруженным расширением, открывает страницу настройки
 * в CRM и смотрит, увидела ли она помощника. Это единственная часть, которую
 * нельзя проверить обычным сценарием скриншотов: там расширения отключены.
 *
 * Запуск: node scripts/test-max-helper.mjs
 */
import puppeteer from "puppeteer-core";
import path from "node:path";

const BRAVE =
  "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";
const EXT = path.resolve("apps/max-helper");
const BASE =
  process.env.SHOT_BASE ?? "https://crm-preview.104-128-128-96.sslip.io";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BRAVE,
  headless: "new",
  args: [
    "--no-first-run",
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    "--window-size=1400,900",
  ],
  defaultViewport: { width: 1400, height: 900 },
});

try {
  const page = await browser.newPage();
  await page.goto(`${BASE}/max-setup.html`, { waitUntil: "domcontentloaded" });
  await sleep(2500);

  const state = await page.evaluate(() => ({
    flag: document.documentElement.dataset.hulkMaxHelper ?? null,
    status: document.getElementById("statusText")?.textContent?.trim(),
    hint: document.getElementById("statusHint")?.textContent?.trim().slice(0, 80),
    installBlockHidden: document
      .getElementById("install")
      ?.classList.contains("hidden"),
  }));
  console.log("страница настройки:", JSON.stringify(state, null, 1));

  // Мостик отвечает на ping?
  const pong = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const requestId = "t1";
        const t = setTimeout(() => resolve("нет ответа"), 3000);
        window.addEventListener("message", function on(e) {
          const d = e.data;
          if (d?.source !== "hulk-max-helper" || d.requestId !== requestId) return;
          clearTimeout(t);
          window.removeEventListener("message", on);
          resolve("версия " + d.version);
        });
        window.postMessage({ source: "hulk-crm", type: "hulk-ping", requestId }, "*");
      }),
  );
  console.log("ответ помощника на ping:", pong);

  // Просим открыть чат — MAX потребует вход, поэтому ждём осмысленную ошибку,
  // а не успех. Важно, что цепочка CRM → мостик → фон → вкладка работает.
  const opened = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const requestId = "t2";
        const t = setTimeout(() => resolve({ error: "нет ответа за 40с" }), 40000);
        window.addEventListener("message", function on(e) {
          const d = e.data;
          if (d?.source !== "hulk-max-helper" || d.requestId !== requestId) return;
          clearTimeout(t);
          window.removeEventListener("message", on);
          resolve(d.result);
        });
        window.postMessage(
          {
            source: "hulk-crm",
            type: "hulk-open-max",
            phone: "+7 961 273-95-08",
            requestId,
          },
          "*",
        );
      }),
  );
  console.log("запрос «открой чат»:", JSON.stringify(opened));

  const urls = (await browser.pages()).map((p) => p.url());
  console.log(
    "вкладки MAX:",
    urls.filter((u) => u.includes("max.ru")).length,
    urls.filter((u) => u.includes("max.ru")),
  );
} finally {
  await browser.close();
}
