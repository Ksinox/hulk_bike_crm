/** Дебаг: открытие формы редактирования скутера. */
export async function run(page, ctx) {
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2400);
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('div[role="button"]')].filter(
      (r) => /Открыть/.test(r.textContent || "") && (r.textContent || "").length < 400,
    );
    rows[0]?.click();
  });
  await ctx.sleep(2400);
  const btns = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .map((b) => (b.textContent || "").trim())
      .filter((t) => /Редакт/.test(t)),
  );
  console.log("кнопки:", JSON.stringify(btns));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Редактировать/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(2000);
  const st = await page.evaluate(() => ({
    form: /Редактирование/.test(document.body.innerText),
    frameField: /Номер рамы/.test(document.body.innerText),
    inputs: document.querySelectorAll("input").length,
  }));
  console.log("после клика:", JSON.stringify(st));
  await ctx.shot("v2-2-debug", { jpeg: true });
}
