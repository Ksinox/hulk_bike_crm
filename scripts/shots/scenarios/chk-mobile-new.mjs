/** Мобильная проверка новых экранов: заявки, обзор продаж, карточка. */
export async function run(page, ctx) {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);

  await ctx.gotoRoute("sales");
  await ctx.sleep(2200);
  const ov = await page.evaluate(() => ({
    overflowX:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    apps: [...document.querySelectorAll("button")].some((b) =>
      (b.textContent || "").trim().startsWith("Заявки"),
    ),
  }));
  console.log("продажи:", JSON.stringify(ov));
  await ctx.shot("chk-mob-sales", { jpeg: true });

  // Клик по «Заявки» — на телефоне наведения нет, должен открыться список
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => (b.textContent || "").trim().startsWith("Заявки"))?.click();
  });
  await ctx.sleep(1500);
  const panel = await page.evaluate(() => ({
    open: /Заявки на покупку/.test(document.body.innerText),
    back: [...document.querySelectorAll("button")].some(
      (b) => (b.textContent || "").trim() === "Назад",
    ),
    overflowX:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  console.log("панель:", JSON.stringify(panel));
  await ctx.shot("chk-mob-apps", { jpeg: true });
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => (b.textContent || "").trim() === "Назад")?.click();
  });
  await ctx.sleep(900);

  // Аренды
  await ctx.gotoRoute("rentals");
  await ctx.sleep(2400);
  console.log("аренды:", await page.evaluate(() => ({
    apps: [...document.querySelectorAll("button")].some((b) =>
      (b.textContent || "").trim().startsWith("Заявки"),
    ),
    overflowX:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
  })));
  await ctx.shot("chk-mob-rentals", { jpeg: true });
}
