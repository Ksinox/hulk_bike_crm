/** Форма СОЗДАНИЯ модели: превью без фото + требования к фото. */
export async function run(page, ctx) {
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Модели",
    );
    b?.click();
  });
  await ctx.sleep(1500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Добавить модель/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(1600);
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      title: (t.match(/Новая модель|Изменить модель/) || [""])[0],
      preview: /ТАК БУДЕТ ВЫГЛЯДЕТЬ|Так будет выглядеть/i.test(t),
      noPhoto: /фото не загружено/.test(t),
      hint: /Загрузите сразу после создания/.test(t),
    };
  });
  console.log("create:", JSON.stringify(st));
  await ctx.shot("fb-model-create2", { jpeg: true });

  // ввод названия — превью должно ожить
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) =>
      /Yamaha Jog/.test(i.placeholder || ""),
    );
    if (!inp) return;
    const s = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    s.call(inp, "Suzuki Lets 2");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ctx.sleep(800);
  console.log(
    "превью с введённым именем:",
    await page.evaluate(() => /Suzuki Lets 2/.test(document.body.innerText)),
  );
  await ctx.shot("fb-model-create3", { jpeg: true });
}
