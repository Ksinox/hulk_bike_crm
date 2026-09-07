/**
 * Кадры «СТАЛО» для пунктов про мобильную и планшетную версию (07.09).
 * Снимаются с preview, кладутся в apps/web/public/progress/.
 */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  const dismiss = () =>
    page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => /^Позже$/.test((b.textContent || "").trim()))
        ?.click();
    });
  const tapText = (needle) =>
    page.evaluate((n) => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => (x.textContent || "").trim().includes(n) && !x.disabled,
      );
      if (b) b.click();
      return !!b;
    }, needle);

  const phone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const tablet = { width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const tabletLand = { width: 1180, height: 820, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

  /* ---- Телефон: меню новой сделки ---- */
  await page.setViewport(phone);
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5500);
  await dismiss();
  await ctx.sleep(600);
  await tapText("Сделка");
  await ctx.sleep(1500);
  await S("mb-now-deals");

  /* ---- Телефон: «Ремонт» открывает приём чужой техники ---- */
  await tapText("Ремонт");
  await ctx.sleep(3200);
  console.log("ремонт с телефона:", JSON.stringify({
    окно: /Приём|Новый ремонт|заказ-наряд/i.test(await page.evaluate(() => document.body.innerText)),
  }));
  await S("mb-now-repair");

  /* ---- Телефон: аналитика ---- */
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await dismiss();
  await ctx.gotoRoute("analytics");
  await ctx.sleep(4000);
  await S("mb-now-analytics");

  /* ---- Телефон: настройка стены ---- */
  await tapText("Настройка стены");
  await ctx.sleep(2800);
  await S("mb-now-setup");
  await page.evaluate(() => window.scrollTo(0, 560));
  await ctx.sleep(700);
  await S("mb-now-setup-list");

  /* ---- Планшет-портрет: обзор ---- */
  await page.setViewport(tablet);
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await dismiss();
  await ctx.gotoRoute("analytics");
  await ctx.sleep(4000);
  await S("tb-now-portrait");

  /* ---- Планшет-портрет: настройка стены ---- */
  await tapText("Настройка стены");
  await ctx.sleep(2800);
  await S("tb-now-setup");

  /* ---- Планшет-альбом: обзор ---- */
  await page.setViewport(tabletLand);
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await dismiss();
  await ctx.gotoRoute("analytics");
  await ctx.sleep(4000);
  await S("tb-now-landscape");

  /* ---- Планшет-альбом: ремонты ---- */
  await ctx.gotoRoute("service");
  await ctx.sleep(3200);
  await S("tb-now-service");
}
