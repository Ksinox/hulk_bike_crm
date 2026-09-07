/** Кадры «стало» для пункта про кнопку сделки в разделах на телефоне. */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  const dismiss = () =>
    page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => /^Позже$/.test((b.textContent || "").trim()))
        ?.click();
    });
  const tapExact = (needle) =>
    page.evaluate((n) => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => (x.textContent || "").trim() === n && !x.disabled,
      );
      if (b) b.click();
      return !!b;
    }, needle);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5200);
  await dismiss();

  await ctx.gotoRoute("sales");
  await ctx.sleep(3200);
  await S("mb-now-sales-fab");
  await tapExact("Продажа");
  await ctx.sleep(3000);
  await S("mb-now-sale-wizard");

  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(3200);
  await S("mb-now-buyout-fab");
}
