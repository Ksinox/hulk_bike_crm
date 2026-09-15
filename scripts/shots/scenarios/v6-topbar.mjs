/** Шапка в одну строку на среднем экране. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3200);
  await ctx.gotoRoute("sales");
  await ctx.sleep(2400);
  await ctx.shot("v6-topbar-1280", { jpeg: true });
}
