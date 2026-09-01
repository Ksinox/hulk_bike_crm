/**
 * Снимает служебную страницу браузера «Расширения» для инструкции.
 *
 * Обычные сценарии скриншотов сюда не годятся: страница brave://extensions
 * внутренняя, к ней нет доступа ни у расширений, ни у наших скриптов на
 * сайте. Поэтому поднимаем отдельный браузер с чистым профилем и снимаем
 * его же настройки — на компьютере оператора всё выглядит так же.
 *
 * Запуск: node scripts/shoot-extensions-page.mjs
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const BRAVE =
  "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";
const EXT = path.resolve("apps/max-helper");
const OUT = path.resolve("apps/web/public/help");
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BRAVE,
  headless: "new",
  args: ["--no-first-run", "--window-size=1280,860", "--lang=ru"],
  defaultViewport: { width: 1280, height: 860 },
});

try {
  const page = await browser.newPage();

  // 1. Страница расширений «как есть»
  await page.goto("brave://extensions/", { waitUntil: "domcontentloaded" });
  await sleep(2500);
  console.log("адрес:", page.url(), "| заголовок:", await page.title());

  const text = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log("текст страницы:", JSON.stringify(text));

  await page.screenshot({
    path: path.join(OUT, "ext-1-page.jpg"),
    type: "jpeg",
    quality: 84,
    clip: { x: 0, y: 0, width: 1280, height: 240 },
  });
  console.log("снято: ext-1-page.jpg");

  // 2. Ищем тумблер «Режим разработчика» (он в теневом дереве)
  const toggle = await page.evaluate(() => {
    const mgr = document.querySelector("extensions-manager");
    const bar = mgr?.shadowRoot?.querySelector("extensions-toolbar");
    const tgl = bar?.shadowRoot?.querySelector("#devMode");
    if (!tgl) return null;
    const r = tgl.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  console.log("тумблер «Режим разработчика»:", JSON.stringify(toggle));

  if (toggle) {
    await page.mouse.click(toggle.x, toggle.y);
    await sleep(1500);
    await page.screenshot({
      path: path.join(OUT, "ext-2-devmode.jpg"),
      type: "jpeg",
      quality: 84,
      clip: { x: 0, y: 0, width: 1280, height: 240 },
    });
    console.log("снято: ext-2-devmode.jpg");
    console.log(
      "после включения:",
      JSON.stringify(
        await page.evaluate(() => document.body.innerText.slice(0, 300)),
      ),
    );
  }
} finally {
  await browser.close();
}

// 3. Отдельный запуск — уже с установленным дополнением, чтобы показать,
//    как выглядит успешный результат.
const b2 = await puppeteer.launch({
  executablePath: BRAVE,
  headless: "new",
  args: [
    "--no-first-run",
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    "--window-size=1280,860",
    "--lang=ru",
  ],
  defaultViewport: { width: 1280, height: 860 },
});
try {
  const p2 = await b2.newPage();
  await p2.goto("brave://extensions/", { waitUntil: "domcontentloaded" });
  await sleep(2500);
  await p2.screenshot({
    path: path.join(OUT, "ext-3-installed.jpg"),
    type: "jpeg",
    quality: 84,
    clip: { x: 320, y: 190, width: 640, height: 280 },
  });
  console.log("снято: ext-3-installed.jpg");
  console.log(
    "видно дополнение:",
    (await p2.evaluate(() => document.body.innerText)).includes("Халк"),
  );
} finally {
  await b2.close();
}
