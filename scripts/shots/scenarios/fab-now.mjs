/**
 * «Развитие» 2.93, СТАЛО (16.09): окно поверх плавающей кнопки и нижнего
 * меню. Снимать с SHOT_ANIM=1 — без анимаций ошибку не видно.
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const tapFab = () => page.evaluate(() => document.querySelector('[data-tour="fab"]')?.click());

  await page.setUserAgent(PHONE_UA);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await ctx.gotoRoute("sales");
  await ctx.sleep(1500);
  await tapFab();
  await ctx.sleep(1500);
  await ctx.shot("fab-now-sale", { jpeg: true });

  await page.setUserAgent(IPAD_UA);
  await page.setViewport({ width: 820, height: 1180, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(1500);
  await tapFab();
  await ctx.sleep(1500);
  await ctx.shot("fab-now-deal-tablet", { jpeg: true });
}
