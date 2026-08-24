/**
 * Пересъёмка кадров пункта 14 после правок заказчика:
 * форма модели (две колонки + живое превью) и каталог с иконками.
 */
export async function run(page, ctx) {
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Модели",
    );
    b?.click();
  });
  await ctx.sleep(1800);

  // 1) Каталог: иконки электро / бензин на плитках
  await ctx.shot("p14-2-badges", { jpeg: true });
  const dioClip = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll("div")].filter(
      (d) =>
        /(^|\s)Dio(\s|$)/.test(d.textContent || "") &&
        (d.textContent || "").length < 220 &&
        d.getBoundingClientRect().height > 200,
    );
    const el = tiles[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, r.x + window.scrollX - 10),
      y: Math.max(0, r.y + window.scrollY - 10),
      width: r.width + 20,
      height: r.height + 20,
    };
  });
  if (dioClip) await ctx.shot("p14-3-dio-crop", { clip: dioClip });

  // 2) Форма модели: две колонки + превью + требования к фото
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button[title="Изменить"]')];
    btns[0]?.click();
  });
  await ctx.sleep(1800);
  const ok = await page.evaluate(() => ({
    preview: /ТАК БУДЕТ ВЫГЛЯДЕТЬ|Так будет выглядеть/i.test(document.body.innerText),
    rules: /4:3/.test(document.body.innerText),
  }));
  console.log("form:", JSON.stringify(ok));
  await ctx.shot("p14-1-form", { jpeg: true });
}
