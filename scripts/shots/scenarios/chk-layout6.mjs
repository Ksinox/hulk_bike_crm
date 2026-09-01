/** Шапка и раздел выкупа на средних экранах + окно платежа. */
export async function run(page, ctx) {
  for (const w of [1370, 1280, 1100]) {
    await page.setViewport({ width: w, height: 800, deviceScaleFactor: 1 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await ctx.sleep(3000);
    await ctx.gotoRoute("rassrochki");
    await ctx.sleep(2200);
    const st = await page.evaluate(() => {
      const bar = [...document.querySelectorAll("div")].find(
        (d) => d.className && String(d.className).includes("rounded-xl bg-surface px-3 py-2.5"),
      );
      const r = bar?.getBoundingClientRect();
      return {
        barHeight: r ? Math.round(r.height) : null,
        overflowX:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    console.log(`${w}px:`, JSON.stringify(st));
    await ctx.shot(`chk-bar-${w}`, { jpeg: true });
  }

  // Открываем карточку — вкладки должны сжаться, а не сдавиться
  await page.setViewport({ width: 1370, height: 850, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3000);
  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(2000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Выкупы")?.click();
  });
  await ctx.sleep(1300);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /#0\d{3}/.test(b.innerText || ""))?.click();
  });
  await ctx.sleep(1600);
  console.log("с карточкой:", await page.evaluate(() => ({
    overflowX:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    tabsText: [...document.querySelectorAll("button")]
      .filter((b) => /Обзор|Выкупы|Просрочки|Клиенты/.test(b.textContent || ""))
      .map((b) => (b.textContent || "").trim())
      .slice(0, 4),
  })));
  await ctx.shot("chk-buyout-drawer", { jpeg: true });

  // Окно платежа: подсказки сумм
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Принять платёж/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(900);
  console.log("окно платежа:", await page.evaluate(() => {
    const t = document.body.innerText;
    const chips = [...document.querySelectorAll("button")]
      .map((b) => (b.textContent || "").trim())
      .filter((x) => /₽\s*(просрочка|ближайший|как обычно|весь остаток)/.test(x));
    return {
      left: t.match(/Осталось\s*([\d\s]+) ₽/)?.[1]?.replace(/\s/g, ""),
      chips,
      methods: ["Наличные", "Перевод", "Смешанно"].filter((m) => t.includes(m)),
    };
  }));
  await ctx.shot("v6-buyout-payment", { jpeg: true });
}
