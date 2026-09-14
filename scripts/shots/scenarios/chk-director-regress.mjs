/** Регрессия: у директора прибыль, закуп и доли на месте (14.09). */
export async function run(page, ctx) {
  const dismiss = () => page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => /^Позже$/.test((b.textContent || "").trim()))?.click(); });
  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5500); await dismiss();
  const t = () => page.evaluate(() => document.body.innerText);
  await ctx.gotoRoute("sales"); await ctx.sleep(3500);
  let s = await t();
  console.log("продажи директор:", JSON.stringify({ прибыль: /ПРИБЫЛЬ/i.test(s), маржа: /Маржинальность/i.test(s), кнопкаСкрыть: /Прибыль скрыта|Скрыть прибыль/.test(s) }));
  await ctx.gotoRoute("service"); await ctx.sleep(3200);
  s = await t();
  console.log("ремонты директор:", JSON.stringify({ прибыль: /прибыль/i.test(s) }));
  await ctx.gotoRoute("partners"); await ctx.sleep(3000);
  s = await t();
  console.log("партнёрка директор:", JSON.stringify({ инвесторы: /Инвесторы/.test(s) }));
  await ctx.gotoRoute("analytics"); await ctx.sleep(3500);
  s = await t();
  console.log("аналитика директор:", JSON.stringify({ прибыльПродаж: /Прибыль с продаж/.test(s), прибыльРемонтов: /Прибыль с ремонтов/.test(s) }));
  await ctx.shot("regress-director-analytics", { jpeg: true });
}
