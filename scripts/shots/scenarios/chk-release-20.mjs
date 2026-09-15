/**
 * Релиз 2.0.0: карточка в «Что нового» на компьютере и телефоне — версия,
 * «было → стало», полный список (число правок = длине списка).
 */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  const info = () =>
    page.evaluate(() => {
      const t = document.body.innerText;
      return {
        версия: /2\.0\.0/.test(t),
        заголовок: /Личные аккаунты, продажи, выкуп/.test(t),
        правок: (t.match(/(\d+)\s+правок/) || [])[1] ?? null,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("whats-new");
  await ctx.sleep(2500);
  console.log("компьютер:", JSON.stringify(await info()));
  await S("rel-desktop");
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Полный список правок/.test(x.textContent || ""));
    b?.click();
    return !!b;
  });
  await ctx.sleep(1200);
  console.log("полный список раскрыт:", opened, JSON.stringify(await info()));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Полный список правок/.test(x.textContent || ""));
    b?.scrollIntoView({ block: "start" });
  });
  await ctx.sleep(600);
  await S("rel-desktop-list");

  await page.setUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  );
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("whats-new");
  await ctx.sleep(2500);
  console.log("телефон:", JSON.stringify(await info()));
  await S("rel-phone");
}
