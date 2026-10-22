/**
 * Раздел договора крупно (22.10: эвакуация п. 5.1.4, утрата п. 5.4).
 * Открывает сохранённый HTML договора и снимает от «5. Ответственность».
 *   FILE=scripts/shots/out/contract-now.html TAG=now node scripts/shots/shot.mjs \
 *     scripts/shots/scenarios/chk-contract-section.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function run(page, ctx) {
  await page.setViewport({ width: 900, height: 1100, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.resolve(process.env.FILE)).href, { waitUntil: "load" });
  await ctx.sleep(600);
  await page.evaluate(() => {
    const h = [...document.querySelectorAll("h2")].find((x) => /Ответственность/.test(x.textContent || ""));
    h?.scrollIntoView({ block: "start" });
    window.scrollBy(0, -10);
  });
  await ctx.sleep(400);
  await ctx.shot(`contract-sec5-${process.env.TAG ?? "now"}`, { jpeg: true });
}
