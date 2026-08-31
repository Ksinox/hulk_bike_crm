/** Финальная сквозная проверка после всех правок. */
export async function run(page, ctx) {
  const results = {};
  await ctx.gotoRoute("sales");
  await ctx.sleep(2600);
  results.overview = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      tabs: ["Обзор", "Сделки", "В продаже", "Менеджеры"].every((x) => t.includes(x)),
      plan: /План продаж/.test(t),
      ratings: /Рейтинг менеджеров/.test(t) && /Рейтинг моделей/.test(t),
      overflowX:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  // Мастер: шаг клиента на телефоне
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  await ctx.gotoRoute("sales");
  await ctx.sleep(2000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Новая продажа/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1600);
  results.mobileWizard = await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) =>
      /Имя или/.test(i.placeholder || ""),
    );
    return {
      inputWidth: inp ? Math.round(inp.getBoundingClientRect().width) : null,
      overflowX:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  await ctx.shot("chk-final-mobile-client", { jpeg: true });
  console.log(JSON.stringify(results, null, 1));
}
