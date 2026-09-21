/** Прод грузится и не сыплет ошибками (без входа — только экран входа). */
import puppeteer from "puppeteer-core";
const BRAVE = "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";
const browser = await puppeteer.launch({ executablePath: BRAVE, headless: "new" });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 120)));
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 120)));
  const bad = [];
  page.on("response", (r) => {
    if (r.status() >= 500) bad.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  await page.goto("https://crm.hulkbike.ru/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 7000));
  const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 120));
  const ver = await page.evaluate(() => fetch("/version.json").then((r) => r.json()));
  console.log("экран:", text);
  console.log("версия:", JSON.stringify(ver));
  console.log("ошибок в консоли:", errors.length, errors.slice(0, 3).join(" | "));
  console.log("ответов 5xx:", bad.length, bad.slice(0, 3).join(" | "));
  await page.screenshot({ path: "scripts/shots/out/prod-boot.jpg", type: "jpeg", quality: 80 });
} finally {
  await browser.close();
}
