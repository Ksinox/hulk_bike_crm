/** Обзор продаж после переработки: плотность и график. */
export async function run(page, ctx) {
  await ctx.gotoRoute("sales");
  await ctx.sleep(3200);
  await ctx.shot("chk-ov2-month", { jpeg: true });
  const m = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("section")];
    const find = (re) =>
      cards.find((c) => new RegExp(re).test(c.textContent || ""));
    const dyn = find("Динамика продаж");
    const plan = find("План продаж");
    const mgr = find("Рейтинг менеджеров");
    const rect = (el) => (el ? el.getBoundingClientRect() : null);
    const d = rect(dyn), p = rect(plan), g = rect(mgr);
    return {
      buckets: (document.body.innerText.match(/Часы|Дни|Недели|Месяцы|Годы/g) || []).length,
      dynH: d ? Math.round(d.height) : null,
      planH: p ? Math.round(p.height) : null,
      // Зазор между низом ряда «динамика/план» и рейтингами
      gapToRatings: d && g ? Math.round(g.top - Math.max(d.bottom, p.bottom)) : null,
      overflowX:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log("месяц:", JSON.stringify(m));

  // Разрез «Часы» при периоде «Сегодня»
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Сегодня")?.click();
  });
  await ctx.sleep(1800);
  const today = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      axis: /по часам/.test(t),
      empty: /продаж не было/.test(t),
    };
  });
  console.log("сегодня:", JSON.stringify(today));
  await ctx.shot("chk-ov2-today", { jpeg: true });

  // Год → месяцы
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Год")?.click();
  });
  await ctx.sleep(1800);
  console.log("год:", await page.evaluate(() => ({
    axis: /по месяцам/.test(document.body.innerText),
  })));
  await ctx.shot("chk-ov2-year", { jpeg: true });
}
