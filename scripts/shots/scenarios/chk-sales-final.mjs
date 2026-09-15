/** Финальная проверка «Продаж»: обзор, сделки, дровер, мобилка. */
export async function run(page, ctx) {
  await ctx.gotoRoute("sales");
  await ctx.sleep(2800);
  await ctx.shot("chk-fin-overview", { jpeg: true });

  const ov = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      forecast: /Прогноз на следующий/.test(t),
      overflowX:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log("обзор:", JSON.stringify(ov));

  // Сделки → открыть карточку сделки (дровер)
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Сделки")?.click();
  });
  await ctx.sleep(1600);
  await page.evaluate(() => {
    document.querySelector("tbody tr")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
  });
  await ctx.sleep(1600);
  const drawer = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      open: /Сделка #/.test(t),
      money: /ПРОДАЖА|Продажа/.test(t),
      docs: /Договор/.test(t),
      vin: /VIN \/ рама/.test(t),
      overflowX:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log("дровер сделки:", JSON.stringify(drawer));
  await ctx.shot("chk-fin-deal-drawer", { jpeg: true });

  // Поиск по VIN
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => /Сделка #/.test(x.closest("div")?.innerText || "") && x.querySelector("svg"),
    );
    void b;
  });
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) =>
      /VIN/.test(i.placeholder || ""),
    );
    if (!inp) return;
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(inp), "value",
    ).set;
    setter.call(inp, "HKHK");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ctx.sleep(1200);
  const search = await page.evaluate(() => ({
    rows: document.querySelectorAll("tbody tr").length,
    hint: document.body.innerText.match(/найдено (\d+)/)?.[1],
  }));
  console.log("поиск по VIN:", JSON.stringify(search));
  await ctx.shot("chk-fin-search", { jpeg: true });

  // Мобильный вид
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  await ctx.gotoRoute("sales");
  await ctx.sleep(2200);
  const mob = await page.evaluate(() => ({
    overflowX:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    hasTabs: /Обзор/.test(document.body.innerText),
  }));
  console.log("мобилка обзор:", JSON.stringify(mob));
  await ctx.shot("chk-fin-mobile", { jpeg: true });

  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "В продаже")?.click();
  });
  await ctx.sleep(1600);
  const mobStock = await page.evaluate(() => ({
    overflowX:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    cards: document.body.innerText.match(/Продать/g)?.length ?? 0,
  }));
  console.log("мобилка витрина:", JSON.stringify(mobStock));
  await ctx.shot("chk-fin-mobile-stock", { jpeg: true });
}
