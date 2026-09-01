/** Способ расчёта: выплата инвестору. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3000);
  await ctx.gotoRoute("partners");
  await ctx.sleep(2500);

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

  const found = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Выплатить|Нет средств/.test(x.textContent || ""),
    );
    if (!b) return { btn: null, text: document.body.innerText.slice(0, 300) };
    b.click();
    return { btn: (b.textContent || "").trim() };
  });
  await ctx.sleep(1000);
  console.log("кнопка:", JSON.stringify(found).slice(0, 400));
  console.log(
    "диалог:",
    await page.evaluate(() => {
      const t = document.body.innerText;
      const i = t.indexOf("Выплатить");
      return i < 0 ? "нет" : t.slice(i, i + 240).split("\n").join(" / ");
    }),
  );
  await ctx.shot("v6-investor-payout", { jpeg: true });
}
