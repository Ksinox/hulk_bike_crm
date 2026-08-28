/** Финальная сверка правок 28.08 (вторая порция). */
export async function run(page, ctx) {
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

  const scrollCheck = () =>
    page.evaluate(() => {
      const bad = [...document.querySelectorAll("*")].filter((e) => {
        const ox = getComputedStyle(e).overflowX;
        return (ox === "auto" || ox === "scroll") && e.scrollWidth > e.clientWidth + 2;
      });
      return {
        n: bad.length,
        who: bad.slice(0, 2).map((e) => String(e.className).slice(0, 45)),
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

  // 1. Партнёрка → электротранспорт + дровер
  await ctx.gotoRoute("partners");
  await ctx.sleep(2600);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim() === "Электротранспорт",
    );
    t?.click();
  });
  await ctx.sleep(1600);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("button")].find(
      (b) => /Волков/.test(b.textContent || "") && /₽/.test(b.textContent || ""),
    );
    row?.click();
  });
  await ctx.sleep(2200);
  console.log("партнёрка-электро скроллы:", JSON.stringify(await scrollCheck()));
  const card = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      tabs: /Обзор/.test(t) && /Экономика/.test(t),
      ownershipEditable: [...document.querySelectorAll("button")].some((b) =>
        /^(Партнёрская|Наша)$/.test((b.textContent || "").trim()),
      ),
    };
  });
  console.log("карточка:", JSON.stringify(card));
  await ctx.shot("chk-a3-partner-fleet", { jpeg: true });

  // 2. Смена статуса партнёрской: нет продажи/выкупа
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Статус|Изменить статус/.test((x.textContent || "").trim()),
    );
    b?.click();
  });
  await ctx.sleep(1500);
  const statuses = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      hasBuyout: /Передан в выкуп/.test(t),
      hasSale: /На продажу/.test(t),
      hasSold: /Продан/.test(t),
      dialogOpen: /Изменить статус|Куда перенести/.test(t),
    };
  });
  console.log("статусы партнёрской:", JSON.stringify(statuses));
  await ctx.shot("chk-a3-statuses", { jpeg: true });
}
