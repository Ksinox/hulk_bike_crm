/** Итоговая проверка правок 01.09: узкий экран, календарь выкупа, мобила. */
export async function run(page, ctx) {
  // 1) Карточка клиента на узком экране — список уступает место карточке
  await page.setViewport({ width: 900, height: 860, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3200);
  await ctx.gotoRoute("clients");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const row = btns.find(
      (b) => /Максим Орлов/.test(b.textContent || "") && b.className.includes("grid"),
    );
    (row ?? btns.find((b) => /Максим Орлов/.test(b.textContent || "")))?.click();
  });
  await ctx.sleep(1600);
  console.log(
    "клиент 900px:",
    await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        back: t.includes("Назад к списку"),
        listGone: !t.includes("Павел Морозов"),
        cardShown: t.includes("Оборот"),
        overflowX:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      };
    }),
  );
  await ctx.shot("v6-client-narrow", { jpeg: true });

  // 2) Обзор выкупа: период + динамика платежей
  await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3200);
  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(2600);
  console.log(
    "обзор выкупа:",
    await page.evaluate(() => {
      const t = document.body.innerText;
      const i = t.indexOf("Динамика платежей");
      return {
        chart: i >= 0,
        head: i < 0 ? "" : t.slice(i, i + 90).split("\n").join(" / "),
        collected: /СОБРАНО[\s\S]{0,80}/.exec(t)?.[0].split("\n").join(" / "),
        overflowX:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      };
    }),
  );
  await ctx.shot("v6-buyout-overview", { jpeg: true });

  // 3) Мобильный вид: дашборд с напоминанием и раздел выкупа
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  console.log(
    "мобила дашборд:",
    await page.evaluate(() => {
      const t = document.body.innerText;
      const i = t.indexOf("Напоминания");
      return {
        found: i >= 0,
        text: i < 0 ? "" : t.slice(i, i + 130).split("\n").join(" / "),
        overflowX:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      };
    }),
  );
  await ctx.shot("v6-mobile-reminders", { jpeg: true });

  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(2600);
  console.log(
    "мобила выкуп:",
    await page.evaluate(() => ({
      chart: document.body.innerText.includes("Динамика платежей"),
      overflowX:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    })),
  );
  await ctx.shot("v6-mobile-buyout", { jpeg: true });
}
