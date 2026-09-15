/** Кадр аналитики, где сторонние ремонты уже считаются. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /^Позже$/.test((b.textContent || "").trim()))?.click();
  });
  await ctx.sleep(700);
  await ctx.gotoRoute("analytics");
  await ctx.sleep(4500);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find(
      (d) => /СТОРОННИЕ РЕМОНТЫ/i.test(d.textContent || "") && (d.textContent || "").length < 60,
    );
    el?.scrollIntoView({ block: "center" });
  });
  await ctx.sleep(1200);
  const info = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      сторонние: /Сторонние ремонты/.test(t),
      выручка: /Выручка с ремонтов/.test(t),
      прибыль: /Прибыль с ремонтов/.test(t),
      прочерк: /раздел сторонних ремонтов ещё не запущен/.test(t),
    };
  });
  console.log("аналитика:", JSON.stringify(info));
  await ctx.shot("a-sv-13-analytics", { jpeg: true });
}
