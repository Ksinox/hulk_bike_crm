/** Шаг «Клиент»: поиск, «Новый», «Анкета». */
export async function run(page, ctx) {
  await ctx.gotoRoute("sales");
  await ctx.sleep(2500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Новая продажа/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1800);
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      step: t.match(/Шаг \d из 6/)?.[0],
      hasNew: /Новый/.test(t),
      hasForm: /Анкета/.test(t),
      hint: /отправьте ему анкету/.test(t),
    };
  });
  console.log("шаг клиента:", JSON.stringify(st));
  await ctx.shot("v5-sales-client", { jpeg: true });

  // Мобильный вид того же шага
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  await ctx.gotoRoute("sales");
  await ctx.sleep(2000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Новая продажа/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1800);
  const mob = await page.evaluate(() => ({
    overflowX:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    step: document.body.innerText.match(/Шаг \d из 6/)?.[0],
  }));
  console.log("мобилка мастер:", JSON.stringify(mob));
  await ctx.shot("v5-sales-mobile", { jpeg: true });
}
