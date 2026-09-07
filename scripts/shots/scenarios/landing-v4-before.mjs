/** «БЫЛО» для пункта 2.68: «100% из 2%», 999% и подписи темпа (старая сборка). */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(6000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /^Позже$/.test((b.textContent || "").trim()))?.click();
  });
  await ctx.sleep(500);
  await ctx.gotoRoute("analytics");
  await ctx.sleep(4000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Настройка стены/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(2500);
  console.log("было:", JSON.stringify(await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      изДва: /из 2%/.test(t),
      девятьсот: /999%/.test(t),
      темп: (t.match(/опережением|не дотянули|отстаём/g) || []).length,
    };
  })));
  await S("b-v4-summary");
}
