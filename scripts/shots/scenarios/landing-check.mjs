/** Проверочный кадр страницы «Развитие»: титул + пункт 9 раскрыт. */
export async function run(page, ctx) {
  await ctx.gotoRoute("progress");
  await ctx.sleep(1200);
  await ctx.shot("landing-top");
  // раскрыть пункт 9
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Корректная калькуляция/.test(x.textContent || ""),
    );
    b?.click();
    b?.scrollIntoView({ block: "start" });
    window.scrollBy(0, -80);
  });
  await ctx.sleep(1500);
  await ctx.shot("landing-item9-open");
}
