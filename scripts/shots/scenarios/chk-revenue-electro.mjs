/** Есть ли в блоке «Выручка» следы электро/партнёрской техники. */
export async function run(page, ctx) {
  const scan = (label) => page.evaluate((label) => {
    const t = document.body.innerText;
    return { [label]: {
      "U-5": (t.match(/U-5/g) || []).length,
      "электротранспорт": (t.match(/электротранспорт/gi) || []).length,
      "инвестор": (t.match(/инвестор/gi) || []).length,
      "4 200": t.includes("4 200"), "5 600": t.includes("5 600"),
    } };
  }, label);
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4000);
  console.log(JSON.stringify(await scan("дашборд")));
  // разворачиваем выручку на весь экран
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.getAttribute("title") || x.getAttribute("aria-label") || "").match(/разверн|весь экран|Развернуть/i));
    b?.click();
  });
  await ctx.sleep(1800);
  console.log(JSON.stringify(await scan("полный экран")));
  await ctx.shot("chk-rev-full", { jpeg: true });
  // мобила: экран выручки
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4000);
  await page.evaluate(() => { [...document.querySelectorAll("button,div")].find((x) => /нажмите для разбивки/i.test(x.textContent || "") && x.textContent.length < 120)?.click(); });
  await ctx.sleep(1800);
  console.log(JSON.stringify(await scan("мобила выручка")));
  await ctx.shot("chk-rev-mobile", { jpeg: true });
}
