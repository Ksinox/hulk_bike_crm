/** «БЫЛО» для правки про стилистику и вписывание в монитор. */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(6000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /^Позже$/.test((b.textContent || "").trim()))?.click();
  });
  await ctx.sleep(800);
  await ctx.gotoRoute("analytics");
  await ctx.sleep(4000);
  console.log("доска:", JSON.stringify(await page.evaluate(() => ({
    плиток: document.querySelectorAll("[data-flip-key]").length,
  }))));
  await S("b-bento-1-board");

  // стена на маленьком мониторе — раньше всё мельчало и не помещалось
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/?screen=analytics-wall", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5500);
  console.log("стена:", JSON.stringify(await page.evaluate(() => ({
    прокрутка: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }))));
  await S("b-bento-2-wall");
}
