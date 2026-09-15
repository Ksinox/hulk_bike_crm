/** Подсвечивается ли выбранная плитка-фильтр в Партнёрке. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  await ctx.gotoRoute("partners");
  await ctx.sleep(2500);
  const probe = () => page.evaluate(() => {
    const tiles = [...document.querySelectorAll("button")].filter((b) =>
      /^(Активные|Просрочки|Завершённые|Всего)\n/.test((b.textContent || "").trim() + "\n") ||
      /^(Активные|Просрочки|Завершённые|Всего)\d/.test((b.textContent || "").trim()),
    );
    return tiles.map((b) => {
      const cs = getComputedStyle(b);
      return `${(b.textContent || "").trim().slice(0, 11)} | ring=${b.className.includes("ring-2")} | shadow=${cs.boxShadow.slice(0, 60)}`;
    });
  });
  console.log("по умолчанию:", await probe());
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /^Завершённые/.test((b.textContent || "").trim()))
      ?.click();
  });
  await ctx.sleep(800);
  console.log("после клика:", await probe());
  await page.evaluate(() => window.scrollTo(0, 0));
  await ctx.shot("v6-partner-finished", { jpeg: true });
}
