/** Пересъёмка мобильного кадра аналитики после правки высоты плиток. */
export async function run(page, ctx) {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /^Позже$/.test((b.textContent || "").trim()))?.click();
  });
  await ctx.sleep(800);
  await ctx.gotoRoute("analytics");
  await ctx.sleep(3500);
  console.log("мобила:", JSON.stringify({
    overflowX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    высотаПервой: await page.evaluate(() => {
      const el = [...document.querySelectorAll("[style*='grid-column']")][0];
      return el ? Math.round(el.getBoundingClientRect().height) : null;
    }),
  }));
  await ctx.shot("a-an-7-mobile", { jpeg: true });
}
