/** 15.09, превью: «Развитие» — выкаченное в прод показано «В работе». */
export async function run(page, ctx) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await ctx.gotoRoute("progress");
  await ctx.sleep(3000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Позже/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(800);
  const t = await page.evaluate(() => document.body.innerText);
  console.log(JSON.stringify({
    шапка: (t.match(/\d+ пункт\S* уже работа\S* в CRM/) || [])[0] ?? null,
    вРаботе: (t.match(/(\d+)\s*В работе/) || [])[1] ?? null,
    наПроверке: (t.match(/(\d+)\s*На проверке/) || [])[1] ?? null,
    вРазработке: (t.match(/(\d+)\s*В разработке/) || [])[1] ?? null,
    пилюльНаПроверке: (t.match(/Готово, на проверке/g) || []).length,
  }));
  await ctx.shot("pl-01", { jpeg: true });
  await page.evaluate(() => window.scrollTo(0, 900));
  await ctx.sleep(600);
  await ctx.shot("pl-02", { jpeg: true });
}
