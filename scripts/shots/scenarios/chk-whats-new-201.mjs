/** «Что нового» после выкладки 2.0.1: запись выпуска наверху, число правок, телефон. */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const info = () =>
    page.evaluate(() => {
      const t = document.body.innerText;
      return {
        v201: /2\.0\.1/.test(t),
        title: /сначала категория, партия таблицей/.test(t),
        latin: /Рама — только латиницей/.test(t),
        tour: !!document.querySelector(".rt-title, .rt-card-title"),
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await ctx.gotoRoute("whats-new");
  await ctx.sleep(3500);
  console.log("компьютер:", JSON.stringify(await info()));
  await ctx.shot("whats-new-201-d", { jpeg: true });

  await page.setUserAgent(PHONE_UA);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.gotoRoute("whats-new");
  await ctx.sleep(4000);
  console.log("телефон:", JSON.stringify(await info()));
  await ctx.shot("whats-new-201-m", { jpeg: true });
}
