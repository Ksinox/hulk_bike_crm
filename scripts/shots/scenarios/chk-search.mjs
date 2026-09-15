/** Глобальный поиск: находит по разным полям, ранжирует, раскрывается. */
export async function run(page, ctx) {
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(3000);

  const type = async (text) => {
    await page.evaluate(() => {
      const i = [...document.querySelectorAll("input")].find((x) =>
        /Поиск: клиент/.test(x.placeholder || ""),
      );
      if (!i) return;
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(i), "value",
      ).set;
      setter.call(i, "");
      i.dispatchEvent(new Event("input", { bubbles: true }));
      i.focus();
    });
    await page.keyboard.type(text, { delay: 20 });
    await ctx.sleep(900);
    return page.evaluate(() => {
      const rows = [...document.querySelectorAll("button")]
        .filter((b) => /КЛИЕНТ|ТЕХНИКА|АРЕНДА|ПРОДАЖА|ЗАЯВКА|МЕНЕДЖЕР/i.test(b.innerText || ""))
        .map((b) => (b.innerText || "").replace(/\n/g, " | ").slice(0, 80));
      return { count: rows.length, rows: rows.slice(0, 5) };
    });
  };

  // 1. Поиск по VIN
  console.log("VIN 213213:", JSON.stringify(await type("213213"), null, 1));
  await ctx.shot("v5-search-vin", { jpeg: true });

  // 2. Поиск по имени
  console.log("имя «смир»:", JSON.stringify(await type("смир"), null, 1));

  // 3. Короткое число — номер в аренде
  console.log("цифра 2:", JSON.stringify(await type("2"), null, 1));
  await ctx.shot("v5-search-num", { jpeg: true });

  // 4. Полноэкранный режим
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Показать все|Открыть на весь экран/.test(b.textContent || ""))
      ?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await ctx.sleep(1200);
  const full = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      open: /Поиск по всей CRM/.test(t),
      chips: (t.match(/Все · \d+/) || [])[0] ?? null,
      hasPages: /\d+ \/ \d+/.test(t),
    };
  });
  console.log("полный экран:", JSON.stringify(full));
  await ctx.shot("v5-search-full", { jpeg: true });
}
