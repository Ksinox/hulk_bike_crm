/** Мобильный аудит 3: есть ли на телефоне кнопки создания, как на компьютере. */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  const dismiss = () =>
    page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => /^Позже$/.test((b.textContent || "").trim()))
        ?.click();
    });
  const buttons = (re) =>
    page.evaluate((src) => {
      const rx = new RegExp(src, "i");
      return [...document.querySelectorAll("button")]
        .filter((b) => rx.test((b.textContent || "").trim()))
        .map((b) => {
          const r = b.getBoundingClientRect();
          return {
            текст: (b.textContent || "").trim().slice(0, 30),
            виден: r.width > 0 && r.height > 0,
            вЭкране: r.top < window.innerHeight && r.bottom > 0,
          };
        });
    }, re);

  const phone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const desktop = { width: 1600, height: 1000, deviceScaleFactor: 1 };

  for (const [name, vp] of [["телефон", phone], ["компьютер", desktop]]) {
    await page.setViewport(vp);
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(5200);
    await dismiss();

    await ctx.gotoRoute("sales");
    await ctx.sleep(3000);
    console.log(`${name} продажи:`, JSON.stringify(await buttons("Новая продажа|Продать")));
    if (name === "телефон") await S("m3-01-sales-top");

    await ctx.gotoRoute("rassrochki");
    await ctx.sleep(3000);
    console.log(`${name} выкуп:`, JSON.stringify(await buttons("Новый выкуп|Оформить выкуп")));
    if (name === "телефон") await S("m3-02-buyout-top");

    await ctx.gotoRoute("service");
    await ctx.sleep(3000);
    console.log(`${name} ремонты:`, JSON.stringify(await buttons("Новый ремонт|Принять")));
  }
}
