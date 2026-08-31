/** Период в шапке графика + порядок фильтров в «Сделках». */
export async function run(page, ctx) {
  await ctx.gotoRoute("sales");
  await ctx.sleep(2800);
  const ov = await page.evaluate(() => {
    const sec = [...document.querySelectorAll("section")].find((x) =>
      /Динамика продаж/.test(x.textContent || ""),
    );
    const head = sec?.querySelector("header");
    const topRow = document.body.innerText.split("\n").slice(0, 12);
    return {
      periodInHeader: /Сегодня[\s\S]{0,60}Год/.test(head?.innerText || ""),
      periodOnTop: /Сегодня\s*Неделя\s*Месяц\s*Год/.test(topRow.join(" ")),
      overflowX:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log("обзор:", JSON.stringify(ov));
  await ctx.shot("v5-sales-overview", { jpeg: true });

  // Сделки: порядок элементов слева направо
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Сделки")?.click();
  });
  await ctx.sleep(1600);
  const deals = await page.evaluate(() => {
    const row = [...document.querySelectorAll("div")].find(
      (d) =>
        /Сегодня/.test(d.innerText || "") &&
        /Отменённые/.test(d.innerText || "") &&
        d.querySelector("input"),
    );
    if (!row) return null;
    const rect = (el) => el.getBoundingClientRect().x;
    const period = [...row.querySelectorAll("button")].find((b) =>
      /^Сегодня$/.test((b.textContent || "").trim()),
    );
    const search = row.querySelector("input");
    const status = [...row.querySelectorAll("button")].find((b) =>
      /^Отменённые$/.test((b.textContent || "").trim()),
    );
    return {
      periodX: period ? Math.round(rect(period)) : null,
      searchX: search ? Math.round(rect(search)) : null,
      statusX: status ? Math.round(rect(status)) : null,
    };
  });
  console.log("сделки:", JSON.stringify(deals));
  await ctx.shot("v5-sales-deals", { jpeg: true });
}
