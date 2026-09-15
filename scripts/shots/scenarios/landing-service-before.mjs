/** «БЫЛО» для блока сторонних ремонтов: раздел был только про свою технику. */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(5500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /^Позже$/.test((b.textContent || "").trim()))?.click();
  });
  await ctx.sleep(800);

  await ctx.gotoRoute("service");
  await ctx.sleep(3500);
  const t = await page.evaluate(() => document.body.innerText);
  console.log("ремонты:", JSON.stringify({
    сторонние: /Сторонний ремонт/.test(t),
    вкладки: ["В работе", "Журнал"].filter((x) => t.includes(x)),
    деньги: /Выручка|Прибыль/.test(t),
  }));
  await S("b-sv-1-service");

  await ctx.gotoRoute("docs");
  await ctx.sleep(3000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Прейскурант/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(2500);
  console.log("прайс:", JSON.stringify({
    работы: /Прайс работ/.test(await page.evaluate(() => document.body.innerText)),
  }));
  await S("b-sv-2-price");
}
