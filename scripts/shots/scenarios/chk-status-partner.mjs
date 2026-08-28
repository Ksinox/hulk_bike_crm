/** Статусы партнёрской техники: без продажи и выкупа. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
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
  await ctx.sleep(2000);
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Статус",
    );
    if (!b) return false;
    b.click();
    return true;
  });
  await ctx.sleep(1600);
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      clickedOk: true,
      options: ["Не распределён", "Готов к аренде", "На ремонте", "ДТП", "Передан в выкуп", "На продажу", "Продан", "В разборке"]
        .filter((o) => t.includes(o)),
    };
  });
  console.log("клик:", clicked, "| статусы:", JSON.stringify(st.options));
  await ctx.shot("chk-status-partner", { jpeg: true });
}
