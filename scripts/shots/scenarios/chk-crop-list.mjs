/** Итог кадрирования: список моделей — вся техника смотрит вправо. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Модели")?.click();
  });
  await ctx.sleep(2500);
  console.log("моделей:", await page.evaluate(() => (document.body.innerText.match(/(\d+) моделей/) || [])[0]));
  await ctx.shot("c-13-models-all-right", { jpeg: true });

  // карточка аренды — как аватарка садится в блок «Скутер»
  await ctx.gotoRoute("rentals");
  await ctx.sleep(3000);
  await page.evaluate(() => {
    [...document.querySelectorAll("tr, [role=button]")].find((x) => /U-5|Козлов/.test(x.textContent || ""))?.click();
  });
  await ctx.sleep(2200);
  await ctx.shot("c-14-rental-card-avatar", { jpeg: true });

  // мобильная карточка модели
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);
  console.log("мобила overflowX:", await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
  await ctx.shot("c-15-mobile-scooters", { jpeg: true });
}
