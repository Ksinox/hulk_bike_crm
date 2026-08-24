/** Правка п.14: окно модели — две колонки, живое превью, ориентиры по фото. */
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

  // 1) Редактирование существующей модели (с фото)
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button[title="Изменить"]')].find(
      (b) => {
        let el = b.parentElement;
        for (let i = 0; i < 6 && el; i++) {
          if ((el.textContent || "").includes("Jog")) return true;
          el = el.parentElement;
        }
        return false;
      },
    );
    btn?.click();
  });
  await ctx.sleep(1500);
  const edit = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      preview: /Так будет выглядеть/.test(t),
      hints: /прозрачном фоне/.test(t),
      photoBlock: /Фото модели/.test(t),
    };
  });
  console.log("edit form:", JSON.stringify(edit));
  await ctx.shot("fb-model-edit", { jpeg: true });

  // 2) Превью реагирует на ввод: меняем название и тариф
  await page.evaluate(() => {
    const setV = (el, v) => {
      const s = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      s.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const name = [...document.querySelectorAll("input")].find((i) =>
      /Yamaha Jog/.test(i.placeholder || ""),
    );
    if (name) setV(name, "Yamaha Jog 2026");
  });
  await ctx.sleep(900);
  const live = await page.evaluate(() =>
    /Yamaha Jog 2026/.test(document.body.innerText),
  );
  console.log("превью обновилось:", live);
  await ctx.shot("fb-model-live", { jpeg: true });

  // 3) Новая модель — подсказки про фото
  await page.keyboard.press("Escape");
  await ctx.sleep(700);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Добавить модель/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(1500);
  const create = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      preview: /Так будет выглядеть/.test(t),
      hint: /Загрузите сразу после создания/.test(t),
      rules: /4:3/.test(t),
    };
  });
  console.log("create form:", JSON.stringify(create));
  await ctx.shot("fb-model-create", { jpeg: true });
}
