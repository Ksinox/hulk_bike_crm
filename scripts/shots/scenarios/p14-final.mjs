/** Пункт 14: финальные кадры — бейджи на Dio + тумблеры в форме. */
export async function run(page, ctx) {
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Модели",
    );
    b?.click();
  });
  await ctx.sleep(1500);
  await ctx.shot("p14-2-badges", { jpeg: true });
  // открыть Dio на редактирование — кадр формы с включёнными тумблерами
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button[title="Изменить"]')];
    // порядок плиток: Jog, Dio, Gear, Tank → вторая кнопка
    btns[1]?.click();
  });
  await ctx.sleep(1200);
  const form = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll("label")].filter((l) =>
      /^(Электро|Партнёрская)/.test((l.textContent || "").trim()),
    );
    return boxes.map((l) => ({
      t: (l.textContent || "").trim().slice(0, 20),
      checked: l.querySelector("input")?.checked,
    }));
  });
  console.log("form toggles:", JSON.stringify(form));
  await ctx.shot("p14-1-form", { jpeg: true });
}
