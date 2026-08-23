import puppeteer from "puppeteer-core";
const BASE = "https://crm-preview.104-128-128-96.sslip.io";
const apiBase = BASE.replace("crm-", "api-");
const BRAVE = "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";

const loginResp = await fetch(apiBase + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ login: "shotbot", password: process.env.SHOTBOT_PASS, remember: true }),
});
const sc = loginResp.headers.get("set-cookie") ?? "";
console.log("login:", loginResp.status, "cookie:", sc.slice(0, 60));
const m = /hulk_session=([^;]+)/.exec(sc);

const browser = await puppeteer.launch({
  executablePath: BRAVE,
  headless: "new",
  args: ["--no-first-run", "--disable-extensions"],
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
page.on("console", (msg) => console.log("PAGE:", msg.type(), msg.text().slice(0, 120)));
page.on("requestfailed", (r) => console.log("FAIL:", r.url().slice(0, 90), r.failure()?.errorText));
await page.setCookie({
  name: "hulk_session", value: m[1],
  domain: new URL(apiBase).hostname, path: "/",
  httpOnly: true, secure: true, sameSite: "None",
});
await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 4000));
const info = await page.evaluate(async () => {
  const me = await fetch("https://api-preview.104-128-128-96.sslip.io/api/auth/me", { credentials: "include" }).then((r) => r.status).catch((e) => String(e));
  return { text: document.body.innerText.slice(0, 200), me };
});
console.log("INFO:", JSON.stringify(info));
await browser.close();
