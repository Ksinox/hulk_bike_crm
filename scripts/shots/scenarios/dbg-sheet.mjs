/** Отладка: какие классы у листа «Партии» на планшете. */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  await page.setUserAgent(IPAD_UA);
  await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Посмотрю позже|^Позже$/.test(b.textContent || ""))?.click();
  });
  console.log(
    "указатель:",
    await page.evaluate(() => ({
      ширина: window.innerWidth,
      грубый: window.matchMedia("(pointer: coarse)").matches,
      наведение: window.matchMedia("(hover: hover)").matches,
      тачек: navigator.maxTouchPoints,
    })),
  );
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2400);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Партии")?.click();
  });
  await ctx.sleep(1600);
  const info = await page.evaluate(() => {
    const panel =
      document.querySelector('[class*="rounded-t-3xl"]') ??
      document.querySelector('[class*="rounded-3xl"]');
    const overlay = panel?.parentElement;
    return {
      оверлей: (overlay?.className || "").toString().slice(0, 200),
      панель: (panel?.className || "").toString().slice(0, 240),
      ширина: panel ? Math.round(panel.getBoundingClientRect().width) : null,
    };
  });
  console.log(JSON.stringify(info, null, 1));
}
