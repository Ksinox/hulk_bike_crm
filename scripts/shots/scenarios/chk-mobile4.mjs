/** Проверка: FAB «Продажа» и «Выкуп» на телефоне открывают тот же мастер. */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  const text = () => page.evaluate(() => document.body.innerText);
  const dismiss = () =>
    page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => /^Позже$/.test((b.textContent || "").trim()))
        ?.click();
    });
  const tapText = (needle) =>
    page.evaluate((n) => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => (x.textContent || "").trim() === n && !x.disabled,
      );
      if (b) b.click();
      return !!b;
    }, needle);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5200);
  await dismiss();

  await ctx.gotoRoute("sales");
  await ctx.sleep(3000);
  console.log("продажи FAB:", JSON.stringify({ есть: await tapText("Продажа") }));
  await ctx.sleep(3000);
  console.log("мастер продажи:", JSON.stringify({ открыт: /Новая продажа/.test(await text()) }));
  await S("m4-01-sale-fab");

  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(3200);
  console.log("выкуп FAB:", JSON.stringify({ есть: await tapText("Выкуп") }));
  await ctx.sleep(3000);
  console.log("мастер выкупа:", JSON.stringify({ открыт: /выкуп/i.test(await text()) }));
  await S("m4-02-buyout-fab");
}
