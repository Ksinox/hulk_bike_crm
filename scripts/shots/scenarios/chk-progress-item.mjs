/**
 * «Развитие»: раскрыть пункт по заголовку и снять его с кадрами.
 *   ITEM="Скутеры по порядку номеров" PHASE=desk|tablet node scripts/shots/shot.mjs \
 *     scripts/shots/scenarios/chk-progress-item.mjs
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const item = process.env.ITEM ?? "";
  if (phase === "tablet") await page.setUserAgent(IPAD_UA);
  await page.setViewport(
    phase === "tablet"
      ? { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
      : { width: 1440, height: 900, deviceScaleFactor: 1 },
  );
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(7000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Посмотрю позже|^Позже$/.test(b.textContent || ""))?.click();
  });
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
  });
  await ctx.gotoRoute("progress");
  await ctx.sleep(2600);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /^Позже$/.test((b.textContent || "").trim()))?.click();
  });
  await ctx.sleep(600);
  const found = await page.evaluate((title) => {
    const el = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes(title));
    if (!el) return false;
    el.click();
    return true;
  }, item);
  await ctx.sleep(2500);
  const info = await page.evaluate((title) => {
    const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes(title));
    btn?.scrollIntoView({ block: "start" });
    window.scrollBy(0, -80);
    const imgs = [...document.querySelectorAll("img")].filter((i) => /v207-sort/.test(i.src));
    return { картинок: imgs.length, загружены: imgs.filter((i) => i.complete && i.naturalWidth > 0).length };
  }, item);
  console.log("пункт:", found, JSON.stringify(info));
  await ctx.sleep(800);
  await ctx.shot(`item-${phase}`, { jpeg: true });
  await page.evaluate(() => window.scrollBy(0, 640));
  await ctx.sleep(600);
  await ctx.shot(`item-${phase}-2`, { jpeg: true });
}
