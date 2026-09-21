/** Что вообще можно нажать в разделе на планшете — список подписей. */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ROUTES = (process.env.ROUTES ?? "rentals,clients,fleet,sales,rassrochki,staff").split(",");

export async function run(page, ctx) {
  await page.setUserAgent(IPAD_UA);
  await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Посмотрю позже|^Позже$/.test(b.textContent || ""))?.click();
  });
  for (const r of ROUTES) {
    await ctx.gotoRoute(r);
    await ctx.sleep(2400);
    const list = await page.evaluate(() =>
      [...document.querySelectorAll("button, [role=button], a")]
        .filter((b) => {
          const x = b.getBoundingClientRect();
          return x.width > 0 && x.height > 0;
        })
        .map((b) => (b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 34) || `<${b.getAttribute("aria-label") ?? "иконка"}>`)
        .filter((t, i, a) => a.indexOf(t) === i)
        .slice(0, 40),
    );
    console.log(`\n=== ${r}\n  ` + list.join(" | "));
  }
}
