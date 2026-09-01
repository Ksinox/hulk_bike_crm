/** Финальный проход: шапка, плитки, карточка клиента, мобила. */
export async function run(page, ctx) {
  // Шапка на «неудобных» ширинах
  for (const w of [1370, 1280, 1150]) {
    await page.setViewport({ width: w, height: 820, deviceScaleFactor: 1 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await ctx.sleep(3200);
    const st = await page.evaluate(() => {
      const bar = [...document.querySelectorAll("div")].find(
        (d) =>
          d.className &&
          String(d.className).includes("rounded-xl bg-surface px-3 py-2.5"),
      );
      return {
        barHeight: bar ? Math.round(bar.getBoundingClientRect().height) : null,
        overflowX:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      };
    });
    console.log(`шапка ${w}px:`, JSON.stringify(st));
  }

  // Карточка клиента 900px
  await page.setViewport({ width: 900, height: 860, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3200);
  await ctx.gotoRoute("clients");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Максим Орлов/.test(b.textContent || ""))
      ?.click();
  });
  await ctx.sleep(1600);
  console.log(
    "клиент 900px:",
    await page.evaluate(() => {
      const boxes = [...document.querySelectorAll("div")].filter((d) =>
        /^(Оборот|Оплата в день|Дней в аренде)$/i.test(
          (d.querySelector("div")?.textContent || "").trim(),
        ),
      );
      return {
        back: document.body.innerText.includes("Назад к списку"),
        overflowX:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        kpiRows: boxes.length,
      };
    }),
  );
  await ctx.shot("v6-client-narrow", { jpeg: true });

  // Мобила: плитки по две в ряд
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(1000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4000);
  console.log(
    "мобила выкуп:",
    await page.evaluate(() => {
      const tiles = [...document.querySelectorAll("div")].filter(
        (d) =>
          d.className &&
          String(d.className).includes("rounded-2xl p-4") &&
          /АКТИВНЫХ|СОБРАНО|ПРОБЛЕМНЫХ|ЗАКРЫТЫХ|ЗАРАБОТОК/i.test(d.innerText || ""),
      );
      const rows = {};
      tiles.forEach((t) => {
        const k = Math.round(t.getBoundingClientRect().top);
        rows[k] = (rows[k] || 0) + 1;
      });
      return {
        perRow: Object.values(rows),
        overflowX:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      };
    }),
  );
  await ctx.shot("v6-mobile-buyout", { jpeg: true });
}
