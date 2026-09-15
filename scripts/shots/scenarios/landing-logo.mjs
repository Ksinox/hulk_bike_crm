/** Логотип «Халк Байк» вместо заглушки H (15.09). SHOT_TAG=was|now */
export async function run(page, ctx) {
  const tag = process.env.SHOT_TAG || "now";
  const dismiss = () => page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => /^Позже$/.test((b.textContent || "").trim()))?.click(); });
  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 2 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5500); await dismiss();
  await ctx.gotoRoute("dashboard"); await ctx.sleep(3000); await dismiss();
  await page.mouse.move(900, 600);
  await ctx.sleep(500);
  await ctx.shot(`logo-${tag}-desktop`, { jpeg: true });
  await ctx.shot(`logo-${tag}-desktop-crop`, { clip: { x: 0, y: 0, width: 700, height: 330 } });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000); await dismiss();
  await ctx.gotoRoute("dashboard"); await ctx.sleep(2500);
  await ctx.shot(`logo-${tag}-mobile`, { jpeg: true });
  await ctx.shot(`logo-${tag}-mobile-crop`, { clip: { x: 0, y: 0, width: 390, height: 150 } });
}
