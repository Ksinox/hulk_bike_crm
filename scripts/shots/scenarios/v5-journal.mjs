/** Журнал техники после фикса + запись о продаже. */
export async function run(page, ctx) {
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Журнал/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(2500);
  const j = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("button")]
      .map((b) => (b.innerText || "").split("\n")[0])
      .filter((t) => /Статус|УДАЛЁН|Добавлена|номер|Замена/.test(t));
    return {
      total: rows.length,
      naked: rows.filter((t) => t.trim() === "Изменён статус").length,
      sample: rows.slice(0, 4),
      hasSold: /«Продан»/.test(document.body.innerText),
      hasDeal: /сделке #/.test(document.body.innerText),
    };
  });
  console.log("журнал:", JSON.stringify(j, null, 1));
  await ctx.shot("v5-sales-journal", { jpeg: true });

  // Фильтр «Смена статуса»
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Смена статуса")?.click();
  });
  await ctx.sleep(1500);
  await ctx.shot("v5-journal-status", { jpeg: true });
  console.log("фильтр:", await page.evaluate(() => ({
    rows: [...document.querySelectorAll("button")].filter((b) =>
      /Статус /.test(b.innerText || ""),
    ).length,
  })));
}
