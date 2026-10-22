/**
 * Аудит планшетной вёрстки в СТАРОМ WebKit (≈ Safari 15, как на iPad Pro
 * 2017 заказчика, 22.10). Chromium и свежий Safari такие поломки не видят.
 *
 * Ищет карточки (shadow-card), которые наезжают друг на друга или вылезают
 * за свой блок, снимает каждый раздел. Нужен Playwright 1.22 с WebKit:
 *   cd <scratch>/pw-old && npm i playwright@1.22.2 && npx playwright install webkit
 *   node scripts/shots/wk-old-audit.mjs  (PW_DIR=<scratch>/pw-old, BASE, SIZES, ROUTES)
 */
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.env.PW_DIR, "package.json"));
const { webkit } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:5199";
const API = process.env.API ?? BASE;
const SIZES = (process.env.SIZES ?? "1024x1366,1366x1024,820x1180,1180x820").split(",");
const ROUTES = (process.env.ROUTES ?? "dashboard,rentals,clients,fleet,debtors,service,sales,rassrochki,finance,analytics").split(",");
const OUT = process.env.OUT ?? "scripts/shots/out";
const TAG = process.env.TAG ?? "now";

const browser = await webkit.launch();
let total = 0;
for (const size of SIZES) {
  const [w, h] = size.split("x").map(Number);
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15",
  });
  const r = await ctx.request.post(API + "/api/auth/login", {
    data: { login: "shotbot", password: process.env.SHOTBOT_PASS, remember: true },
  });
  if (r.status() !== 200) throw new Error("login " + r.status());
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("hulk-release-tour-skip", "1"));
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  for (const route of ROUTES) {
    await page.evaluate((route) => window.dispatchEvent(new CustomEvent("hulk:navigate", { detail: { route } })), route);
    await page.waitForTimeout(3500);
    const bad = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("[class*='shadow-card']")].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 40 && r.height > 40 && !el.closest(".fixed");
      });
      const out = [];
      // 1) карточка вылезает за родительскую карточку
      for (const c of cards) {
        const p = c.parentElement?.closest("[class*='shadow-card']");
        if (!p) continue;
        const a = c.getBoundingClientRect();
        const b = p.getBoundingClientRect();
        if (a.bottom - b.bottom > 24) out.push(`вылезает на ${Math.round(a.bottom - b.bottom)}px: ${String(c.className).slice(0, 70)}`);
      }
      // 2) соседние карточки (не вложенные) наезжают друг на друга
      for (let i = 0; i < cards.length; i++)
        for (let j = i + 1; j < cards.length; j++) {
          const A = cards[i], B = cards[j];
          if (A.contains(B) || B.contains(A)) continue;
          const a = A.getBoundingClientRect(), b = B.getBoundingClientRect();
          const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ix > 30 && iy > 30) out.push(`наезд ${Math.round(ix)}×${Math.round(iy)}: ${String(A.className).slice(0, 50)} ⟷ ${String(B.className).slice(0, 50)}`);
        }
      return [...new Set(out)].slice(0, 6);
    });
    total += bad.length;
    console.log(`${size} ${route}: ${bad.length ? "✗ " + bad.length : "✓"}`);
    for (const b of bad) console.log("    " + b);
    await page.screenshot({ path: path.join(OUT, `wkold-${TAG}-${size}-${route}.png`) });
  }
  await ctx.close();
}
await browser.close();
console.log(total ? `\nПроблем: ${total}` : "\nНаложений нет");
