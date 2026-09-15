/**
 * Планшетная версия (15.09): регресс. Компьютер без касаний — компьютерная
 * версия; телефон — телефонная, шапка и кнопка «+» на своих местах.
 */
export async function run(page, ctx) {
  const layer = () =>
    page.evaluate(() => ({
      слой: document.querySelector("aside") ? "компьютерный" : "телефонный",
      coarse: matchMedia("(pointer: coarse)").matches,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));

  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5500);
  console.log("компьютер 1600:", JSON.stringify(await layer()));
  await ctx.shot("rg-desktop", { jpeg: true });

  await page.setViewport({ width: 1000, height: 800, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  console.log("узкое окно 1000 (мышь):", JSON.stringify(await layer()));

  await page.setUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  );
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5500);
  console.log("телефон 390:", JSON.stringify(await layer()));
  await ctx.shot("rg-phone-dashboard", { jpeg: true });
  await ctx.gotoRoute("rentals");
  await ctx.sleep(1200);
  await ctx.shot("rg-phone-rentals", { jpeg: true });
}
