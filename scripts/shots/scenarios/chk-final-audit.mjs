/** Финальная сверка правок 28.08: подсветка везде + компактный обзор. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

  // 1. Скутеры БЕЗ дровера — обзор должен быть компактным
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2600);
  const overview = await page.evaluate(() => {
    const big = [...document.querySelectorAll("span")].find((x) =>
      /^\d+$/.test((x.textContent || "").trim()) &&
      (x.className || "").includes("font-display"),
    );
    return {
      totalFontSize: big ? getComputedStyle(big).fontSize : null,
      hintsHidden: !/у клиентов сейчас/.test(document.body.innerText),
    };
  });
  console.log("обзор без дровера:", JSON.stringify(overview));
  await ctx.shot("chk-audit-fleet-nodrawer", { jpeg: true });

  // 2. Обычные «Аренды» — подсветка выбранной строки
  await ctx.gotoRoute("rentals");
  await ctx.sleep(2400);
  await page.evaluate(() => {
    const tr = [...document.querySelectorAll("tr")].find((x) =>
      /#00\d\d/.test(x.textContent || ""),
    );
    tr?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await ctx.sleep(1800);
  const rentals = await page.evaluate(() => ({
    highlighted: [...document.querySelectorAll("tr")].filter((r) =>
      (r.className || "").includes("bg-blue-50") ||
      (r.className || "").includes("bg-red-soft/55"),
    ).length,
    cardOpen: /Информация о клиенте/.test(document.body.innerText),
  }));
  console.log("аренды (наши):", JSON.stringify(rentals));
  await ctx.shot("chk-audit-rentals", { jpeg: true });

  // 3. Партнёрка — подсветка + дровер
  await ctx.gotoRoute("partners");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    const tr = [...document.querySelectorAll("tr")].find((x) =>
      /#00\d\d/.test(x.textContent || ""),
    );
    tr?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await ctx.sleep(1800);
  const partner = await page.evaluate(() => ({
    highlighted: [...document.querySelectorAll("tr")].some((r) =>
      (r.className || "").includes("bg-blue-50"),
    ),
  }));
  console.log("партнёрка:", JSON.stringify(partner));
}
