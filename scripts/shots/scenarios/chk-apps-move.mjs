/** Заявки переехали внутрь «Аренд» и «Продаж». */
export async function run(page, ctx) {
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2200);
  const nav = await page.evaluate(() => {
    const a = document.querySelector("aside");
    return { hasApplications: /Заявки/.test(a?.innerText || "") };
  });
  console.log("сайдбар:", JSON.stringify(nav));

  // Аренды → кнопка «Заявки»
  await ctx.gotoRoute("rentals");
  await ctx.sleep(2600);
  const r = await page.evaluate(() => ({
    btn: [...document.querySelectorAll("button")].some(
      (b) => (b.textContent || "").trim().startsWith("Заявки"),
    ),
  }));
  console.log("аренды:", JSON.stringify(r));
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => (b.textContent || "").trim().startsWith("Заявки"))?.click();
  });
  await ctx.sleep(1800);
  const panel = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      title: /Заявки на аренду/.test(t),
      send: /Отправить анкету/.test(t),
      overflowX:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log("панель аренды:", JSON.stringify(panel));
  await ctx.shot("v5-apps-rent", { jpeg: true });
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.getAttribute("aria-label") === "Закрыть")?.click();
  });
  await ctx.sleep(800);

  // Продажи → кнопка «Заявки»
  await ctx.gotoRoute("sales");
  await ctx.sleep(2400);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => (b.textContent || "").trim().startsWith("Заявки"))?.click();
  });
  await ctx.sleep(1800);
  const sale = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      title: /Заявки на покупку/.test(t),
      hint: /Технику покупатель выбирает вживую/.test(t),
      send: /Анкета покупателя/.test(t),
    };
  });
  console.log("панель продаж:", JSON.stringify(sale));
  await ctx.shot("v5-apps-sale", { jpeg: true });
}
