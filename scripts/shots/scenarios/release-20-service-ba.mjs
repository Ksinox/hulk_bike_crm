/** Кадр «стало» для сравнения «Ремонтов» в презентации 2.0 — в размере кадра «было» (1600×950). */
import path from "node:path";

export async function run(page, ctx) {
  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("service");
  await ctx.sleep(2500);
  await page.screenshot({
    path: path.resolve("apps/web/public/release/2.0/d-service-ba.jpg"),
    type: "jpeg",
    quality: 80,
  });
  console.log("кадр d-service-ba");
}
