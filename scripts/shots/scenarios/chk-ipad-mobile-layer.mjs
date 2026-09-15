/**
 * Диагностика (15.09): как выглядит телефонный слой на экране iPad — чтобы
 * решить, из чего собирать планшетную версию. Слой форсится ?mobile=1,
 * в конце флаг снимается (?mobile=0), чтобы не залипал в профиле.
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  await page.setUserAgent(IPAD_UA);
  for (const vp of [
    { name: "portrait", width: 820, height: 1180 },
    { name: "landscape", width: 1180, height: 820 },
  ]) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(ctx.base + "/?mobile=1", { waitUntil: "domcontentloaded" });
    await ctx.sleep(5500);
    await S(`ipadm-${vp.name}-dashboard`);
    await ctx.gotoRoute("clients");
    await ctx.sleep(1500);
    await S(`ipadm-${vp.name}-clients`);
    await ctx.gotoRoute("rentals");
    await ctx.sleep(1500);
    await S(`ipadm-${vp.name}-rentals`);
  }
  await page.goto(ctx.base + "/?mobile=0", { waitUntil: "domcontentloaded" });
  await ctx.sleep(1500);
}
