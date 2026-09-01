/** Напоминания на дашборде (десктоп + мобила) и способы расчёта. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  console.log("дашборд:", await page.evaluate(() => {
    const t = document.body.innerText;
    const i = t.indexOf("Напоминания");
    return i < 0 ? "НЕТ" : t.slice(i, i + 160).replace(/\n+/g, " / ");
  }));
  await ctx.shot("v6-reminders", { jpeg: true });

  // Выплата инвестору — способ расчёта
  await ctx.gotoRoute("partners");
  await ctx.sleep(2200);
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Выплатить\s/.test(x.textContent || ""));
    if (!b) return "нет кнопки";
    b.click();
    return "ок";
  });
  await ctx.sleep(900);
  console.log("выплата:", opened, await page.evaluate(() => {
    const t = document.body.innerText;
    const i = t.indexOf("Выплатить");
    return t.slice(i, i + 200).replace(/\n+/g, " / ");
  }));
  await ctx.shot("v6-investor-payout", { jpeg: true });
}
