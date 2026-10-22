/**
 * Обзор вёрстки планшета (22.10, заказчик: «вёрстка планшета очень кривая
 * начиная с дашборда — сделать скриншоты, разберём, как сделать круче»).
 * Проходит разделы и снимает каждый экран сверху вниз (с прокруткой).
 *   VP=land|port [ROUTES=dashboard,rentals] node scripts/shots/shot.mjs \
 *     scripts/shots/scenarios/tab-review.mjs
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

const ROUTES = (process.env.ROUTES ?? "dashboard,rentals,clients,fleet,debtors,service,sales,rassrochki,finance,analytics").split(",");

export async function run(page, ctx) {
  const vp = process.env.VP ?? "land";
  await page.setUserAgent(IPAD_UA);
  // VP=pro-land|pro-port — iPad Pro 12.9" (1366×1024): заказчик 22.10
  // прислал, как главная разваливается именно на нём.
  const SIZES = {
    land: [1180, 820],
    port: [820, 1180],
    "pro-land": [1366, 1024],
    "pro-port": [1024, 1366],
  };
  const [w, h] = SIZES[vp] ?? SIZES.land;
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(7000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Посмотрю позже|^Позже$/.test(b.textContent || ""))?.click();
  });
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
  });

  /** Самый большой прокручиваемый блок (у мобильного слоя прокрутка своя). */
  const scrollBy = (dy) =>
    page.evaluate((dy) => {
      const cands = [document.scrollingElement, ...document.querySelectorAll("main, div")].filter((el) => {
        if (!el) return false;
        const cs = el === document.scrollingElement ? null : getComputedStyle(el);
        return el.scrollHeight > el.clientHeight + 20 && (!cs || /auto|scroll/.test(cs.overflowY));
      });
      const el = cands.sort((a, b) => b.clientHeight - a.clientHeight)[0];
      if (!el) return { done: true };
      const before = el.scrollTop;
      el.scrollTop = before + dy;
      return { done: el.scrollTop === before, top: el.scrollTop, h: el.scrollHeight };
    }, dy);

  const H = h;
  for (const route of ROUTES) {
    await ctx.gotoRoute(route);
    await ctx.sleep(2800);
    await scrollBy(-100000);
    for (let i = 1; i <= 4; i++) {
      await ctx.shot(`rev-${vp}-${route}-${i}`, { jpeg: true });
      const r = await scrollBy(Math.round(H * 0.8));
      await ctx.sleep(500);
      if (r.done) break;
    }
  }
}
