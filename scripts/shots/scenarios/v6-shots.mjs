/** Свежие кадры «стало» для пункта 2.27 на лендинге. */
export async function run(page, ctx) {
  // Дашборд с напоминаниями
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  await ctx.shot("v6-reminders", { jpeg: true });

  // Обзор выкупа: плитки + календарь + динамика
  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(2600);
  await ctx.shot("v6-buyout-overview", { jpeg: true });
  await ctx.shot("v6-buyout-tiles", { jpeg: true });

  // Окно платежа
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Выкупы")
      ?.click();
  });
  await ctx.sleep(1300);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Андрей Козлов/.test(b.innerText || ""))
      ?.click();
  });
  await ctx.sleep(1600);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Принять платёж/.test(b.textContent || ""))
      ?.click();
  });
  await ctx.sleep(1000);
  await ctx.shot("v6-buyout-payment", { jpeg: true });

  // Выплата инвестору
  await ctx.gotoRoute("partners");
  await ctx.sleep(2400);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => (b.textContent || "").trim() === "Инвесторы")
      ?.click();
  });
  await ctx.sleep(1500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Волков Игорь/.test(b.textContent || ""))
      ?.click();
  });
  await ctx.sleep(1800);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((x) => /Выплатить/.test(x.textContent || ""))
      ?.click();
  });
  await ctx.sleep(1000);
  await ctx.shot("v6-investor-payout", { jpeg: true });

  // Продажа: способ расчёта на шаге подписи
  await ctx.gotoRoute("sales");
  await ctx.sleep(2400);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => (b.textContent || "").trim() === "Сделки")
      ?.click();
  });
  await ctx.sleep(1500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((x) => /Договор/i.test(x.textContent || ""))
      ?.click();
  });
  await ctx.sleep(1500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Продолжить оформление/.test(b.textContent || ""))
      ?.click();
  });
  await ctx.sleep(1800);
  await ctx.shot("v6-sale-paymethod", { jpeg: true });
}
