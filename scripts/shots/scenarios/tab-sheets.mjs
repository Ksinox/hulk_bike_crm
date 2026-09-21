/**
 * Нижние листы на планшете: меню «Ещё», «Новая сделка», выбор номера.
 *   VP=land|port node scripts/shots/shot.mjs scripts/shots/scenarios/tab-sheets.mjs
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const vp = process.env.VP ?? "land";
  await page.setUserAgent(IPAD_UA);
  await page.setViewport(
    vp === "port"
      ? { width: 820, height: 1180, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
      : { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  );
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Посмотрю позже|^Позже$/.test(b.textContent || ""))?.click();
  });
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
  });

  const tap = async (rx) => {
    const box = await page.evaluate((src) => {
      const r = new RegExp(src);
      const el = [...document.querySelectorAll("button, [role=button], a")]
        .filter((x) => {
          const b = x.getBoundingClientRect();
          return b.width > 2 && b.height > 2 && r.test((x.textContent || "").trim());
        })
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, t: (el.textContent || "").trim().slice(0, 24) };
    }, rx.source);
    if (!box) return null;
    await page.mouse.click(box.x, box.y);
    return box.t;
  };

  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2400);
  console.log("меню «Ещё»:", await tap(/^Ещё$/));
  await ctx.sleep(1200);
  await ctx.shot(`sheet-more-${vp}`, { jpeg: true });
  await page.keyboard.press("Escape");
  await page.mouse.click(20, 20);
  await ctx.sleep(900);

  console.log("новая сделка:", await tap(/^Сделка$|^Новая сделка$/));
  await ctx.sleep(1400);
  await ctx.shot(`sheet-deal-${vp}`, { jpeg: true });
}
