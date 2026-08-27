/** Пересъёмка п.11: вкладка «Электротранспорт» с процентом от инвестора. */
export async function run(page, ctx) {
  await ctx.gotoRoute("partners");
  await ctx.sleep(2400);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim() === "Электротранспорт",
    );
    t?.click();
  });
  await ctx.sleep(1600);
  await ctx.shot("p11-1-partners", { jpeg: true });

  // Кроп: таблица расчёта по единицам
  const clip = await page.evaluate(() => {
    const tbl = document.querySelector("table");
    const wrap = tbl?.closest("div");
    if (!wrap) return null;
    const r = wrap.getBoundingClientRect();
    return { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 };
  });
  console.log("clip:", JSON.stringify(clip));
  if (clip) await ctx.shot("p11-1-summary-crop", { clip });
}
