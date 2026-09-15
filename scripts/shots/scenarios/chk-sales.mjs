/** Блок «Продажи»: обзор, витрина, сделки, менеджеры. */
export async function run(page, ctx) {
  await ctx.gotoRoute("sales");
  await ctx.sleep(3000);
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      title: /Продажи/.test(t),
      tabs: ["Обзор", "Сделки", "В продаже", "Менеджеры"].filter((x) =>
        t.includes(x),
      ),
      kpis: ["В продаже", "Продано", "Выручка", "Прибыль", "Маржинальность"].filter(
        (x) => t.includes(x),
      ),
      plan: /План продаж/.test(t),
      dynamics: /Динамика продаж/.test(t),
      ratings: /Рейтинг менеджеров/.test(t) && /Рейтинг моделей/.test(t),
      overflowX:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      sidebarHasCalc: /Калькулятор/.test(
        document.querySelector("aside")?.innerText || "",
      ),
    };
  });
  console.log("обзор:", JSON.stringify(st));
  await ctx.shot("chk-sales-overview", { jpeg: true });

  // Вкладка «Менеджеры» → добавить менеджера
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Менеджеры")
      ?.click();
  });
  await ctx.sleep(1200);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Добавить менеджера/.test(b.textContent || ""))
      ?.click();
  });
  await ctx.sleep(800);
  const filled = await page.evaluate(() => {
    const setVal = (el, v) => {
      const proto = Object.getPrototypeOf(el);
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const inputs = [...document.querySelectorAll("input")];
    const name = inputs.find((i) => i.placeholder === "Иван Петров");
    const pct = inputs.find((i) => i.inputMode === "numeric");
    if (name) setVal(name, "Тест Менеджеров");
    if (pct) setVal(pct, "10");
    return { name: !!name, pct: !!pct };
  });
  await ctx.sleep(300);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Сохранить")
      ?.click();
  });
  await ctx.sleep(2000);
  const mgr = await page.evaluate(() => ({
    added: /Тест Менеджеров/.test(document.body.innerText),
  }));
  console.log("менеджер:", JSON.stringify({ ...filled, ...mgr }));
  await ctx.shot("chk-sales-managers", { jpeg: true });

  // Вкладка «В продаже»
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "В продаже")
      ?.click();
  });
  await ctx.sleep(1500);
  const stock = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      hasBlock: /Техника в продаже/.test(t),
      rows: document.querySelectorAll("tbody tr").length,
      empty: /Техники в продаже нет/.test(t),
    };
  });
  console.log("витрина:", JSON.stringify(stock));
  await ctx.shot("chk-sales-stock", { jpeg: true });
}
