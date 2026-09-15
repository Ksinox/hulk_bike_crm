/** Проверка 28.08: адаптив контейнеров — дашборд, партнёрка, парк. */
export async function run(page, ctx) {
  // 1. Дашборд 1280 + дровер быстрого просмотра
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2800);
  await page.evaluate(() => {
    // строка «Долги к сбору» — кликаем по имени должника
    const el = [...document.querySelectorAll("button, [role=button], div")]
      .find((b) => /Сергей Петров/.test(b.textContent || "") && (b.textContent || "").length < 200);
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await ctx.sleep(2200);
  const dash = await page.evaluate(() => ({
    drawer: /Информация о клиенте|Быстрый просмотр/.test(document.body.innerText),
    fullLabels: /Загрузка парка/.test(document.body.innerText),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  console.log("дашборд:", JSON.stringify(dash));
  await ctx.shot("chk-n-dash", { jpeg: true });

  // 2. Партнёрка 1280 + дровер аренды: важные колонки видны
  await ctx.gotoRoute("partners");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    const tr = [...document.querySelectorAll("tr")].find((x) =>
      /#00\d\d/.test(x.textContent || ""),
    );
    tr?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await ctx.sleep(2000);
  const partner = await page.evaluate(() => {
    const ths = [...document.querySelectorAll("th")]
      .filter((t) => t.offsetParent !== null)
      .map((t) => (t.textContent || "").trim());
    return { visibleCols: ths };
  });
  console.log("партнёрка:", JSON.stringify(partner));
  await ctx.shot("chk-n-partner", { jpeg: true });

  // 3. Широкий экран: парк-обзор снова двухчастный, плитки в ряд
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2200);
  await ctx.shot("chk-n-fleet-wide", { jpeg: true });
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2200);
  await ctx.shot("chk-n-dash-wide", { jpeg: true });
}
