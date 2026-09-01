/** Мешает ли обнуление opener переиспользованию именованной вкладки. */
export async function run(page, ctx) {
  const browser = page.browser();
  const url = "https://web.max.ru/";

  const count = async () => (await browser.pages()).length;

  // A: имя + обнуляем opener (как сейчас в коде)
  const a0 = await count();
  await page.evaluate((u) => {
    const w = window.open(u, "t_a");
    if (w) { try { w.opener = null; } catch {} }
  }, url);
  await ctx.sleep(2500);
  await page.bringToFront();
  await page.evaluate((u) => {
    const w = window.open(u, "t_a");
    if (w) { try { w.opener = null; } catch {} }
  }, url);
  await ctx.sleep(2500);
  console.log("A (имя + opener=null):", (await count()) - a0, "новых вкладок");

  // B: имя, opener НЕ трогаем
  const b0 = await count();
  await page.bringToFront();
  await page.evaluate((u) => window.open(u, "t_b"), url);
  await ctx.sleep(2500);
  await page.bringToFront();
  await page.evaluate((u) => window.open(u, "t_b"), url);
  await ctx.sleep(2500);
  console.log("B (имя, opener сохранён):", (await count()) - b0, "новых вкладок");
}
