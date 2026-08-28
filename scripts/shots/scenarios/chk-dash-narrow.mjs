/** Проверка 28.08: дашборд на узком экране с открытым дровером. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2800);

  // Открыть быстрый просмотр аренды из «Долги к сбору»
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("button")].find((b) =>
      /Просрочка · \d+ дн/.test(b.textContent || ""),
    );
    row?.click();
  });
  await ctx.sleep(2200);
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      drawerOpen: /Скрыть|Быстрый просмотр/.test(t),
      // Подписи целиком, без обрезков
      labelsOk: /Загрузка парка/.test(t) && /в аренде/.test(t),
      debts: /Долги к сбору/.test(t),
      overflowX:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    };
  });
  console.log("парк-вид:", JSON.stringify(st));
  await ctx.shot("chk-dash-narrow-park", { jpeg: true });

  // Ниже: выручка ушла под колонку?
  await page.evaluate(() => window.scrollTo(0, 900));
  await ctx.sleep(400);
  await ctx.shot("chk-dash-narrow-park2", { jpeg: true });
}
