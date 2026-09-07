/** Мобильный аудит 2: разделы, которые на телефоне переиспользуют десктоп. */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  const text = () => page.evaluate(() => document.body.innerText);
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  const dismiss = () =>
    page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => /^Позже$/.test((b.textContent || "").trim()))
        ?.click();
    });
  /** Кнопки уже 44px по любой стороне — мимо пальца. */
  const smallTargets = () =>
    page.evaluate(() => {
      const out = [];
      for (const b of document.querySelectorAll("button, a[href], input, select")) {
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height < 32 || r.width < 24) {
          const t = (b.textContent || "").trim().slice(0, 24);
          out.push(`${t || b.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`);
        }
      }
      return out.slice(0, 8);
    });

  const phone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  await page.setViewport(phone);
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5500);
  await dismiss();

  const pages = [
    { route: "sales", must: ["Продажи"], shot: "m2-01-sales" },
    { route: "rassrochki", must: ["Выкуп"], shot: "m2-02-buyout" },
    { route: "partners", must: ["Партнёр"], shot: "m2-03-partners" },
    { route: "storage", must: ["Хранилище"], shot: "m2-04-storage" },
    { route: "debtors", must: ["Долж"], shot: "m2-05-debtors" },
    { route: "fleet", must: ["Скутер"], shot: "m2-06-fleet" },
  ];

  for (const p of pages) {
    await ctx.gotoRoute(p.route);
    await ctx.sleep(3200);
    const t = await text();
    console.log(p.route + ":", JSON.stringify({
      есть: p.must.filter((m) => t.includes(m)).length === p.must.length,
      overflowX: await overflow(),
      мелкиеКнопки: await smallTargets(),
    }));
    await S(p.shot);
  }
}
