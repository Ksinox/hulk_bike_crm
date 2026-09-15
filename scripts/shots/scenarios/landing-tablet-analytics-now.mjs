/**
 * «Развитие» 2.73 — планшетные кадры аналитики и ремонтов, переснятые после
 * планшетной версии (15.09): планшет открывает телефонный слой, аналитика в
 * две колонки. Только кадры tb-now-*; телефонные — в landing-mobile-now.mjs.
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  const tapText = (needle) =>
    page.evaluate((n) => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => (x.textContent || "").trim().includes(n) && !x.disabled,
      );
      if (b) b.click();
      return !!b;
    }, needle);
  const clipped = () =>
    page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("main *")) {
        if (el.children.length > 0) continue;
        const t = (el.textContent || "").trim();
        if (t && el.scrollWidth > el.clientWidth + 2) out.push(t.slice(0, 30));
      }
      return out;
    });
  await page.setUserAgent(IPAD_UA);

  await page.setViewport({ width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5500);
  await ctx.gotoRoute("analytics");
  await ctx.sleep(4000);
  console.log("портрет, обрезано:", JSON.stringify(await clipped()));
  await S("tb-now-portrait");
  await tapText("Настройка стены");
  await ctx.sleep(2800);
  await S("tb-now-setup");

  await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5500);
  await ctx.gotoRoute("analytics");
  await ctx.sleep(4000);
  console.log("альбом, обрезано:", JSON.stringify(await clipped()));
  await S("tb-now-landscape");
  await ctx.gotoRoute("service");
  await ctx.sleep(3200);
  await S("tb-now-service");
}
