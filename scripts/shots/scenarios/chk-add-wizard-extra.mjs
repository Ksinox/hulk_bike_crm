/**
 * 2.0.1: модель «из других» под продажу, черновик после обновления страницы,
 * «Начать заново»; каталог моделей с назначением. Ничего не сохраняем.
 */
export async function run(page, ctx) {
  const click = (re, sel = "[data-wizard] button") =>
    page.evaluate(
      (src, sel) => {
        const rx = new RegExp(src);
        const els = [...document.querySelectorAll(sel)].filter((x) => {
          const r = x.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !x.disabled && rx.test((x.textContent || "").trim());
        });
        const el = els.sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.click();
        return el ? (el.textContent || "").trim().slice(0, 40) : null;
      },
      re.source,
      sel,
    );
  const text = () => page.evaluate(() => document.body.innerText.replace(/[  ]/g, " "));

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await page.evaluate(() => {
    localStorage.setItem("hulk.garageTab", "rental");
    for (const k of Object.keys(localStorage)) if (k.startsWith("hulk-draft:add-scooter")) localStorage.removeItem(k);
  });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2000);
  console.log("добавить:", await click(/Добавить скутер/, "button"));
  await ctx.sleep(1000);
  console.log("предвыбрана аренда:", await page.evaluate(() =>
    [...document.querySelectorAll("[data-wizard] button")].some((b) => /^В аренду/.test(b.textContent) && b.className.includes("bg-blue-50")),
  ));
  console.log("продажа:", await click(/^На продажу/));
  await ctx.sleep(700);
  console.log("другие:", await click(/^Другие модели/));
  await ctx.sleep(300);
  console.log("Tank:", await click(/^Tank/));
  await ctx.sleep(300);
  await ctx.shot("wiz-x1-other-model", { jpeg: true });
  console.log("  подсказка:", /при добавлении отметим модель «Продаём»/.test(await text()));
  console.log("далее:", await click(/^Далее/));
  await ctx.sleep(800);
  await page.type('input[data-row="0"][data-col="vin"]', "TSTSB-DRAFT-1");
  await page.type('input[data-row="-1"][data-col="price"]', "88000");
  await ctx.sleep(600);

  // Обновление страницы посреди работы
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(1500);
  console.log("снова открыть:", await click(/Добавить скутер/, "button"));
  await ctx.sleep(1000);
  const t = await text();
  console.log("  баннер черновика:", /Продолжаем черновик/.test(t));
  const vin = await page.$eval('input[data-row="0"][data-col="vin"]', (i) => i.value).catch(() => null);
  console.log("  рама сохранилась:", vin);
  await ctx.shot("wiz-x2-draft-restored", { jpeg: true });
  console.log("проверить:", await click(/^Проверить/));
  await ctx.sleep(700);
  const t3 = await text();
  console.log("  отметим модель:", /Модель «Tank» отметим: «Продаём»/.test(t3));
  console.log("  1 × 88 000:", /1 × 88 000 ₽ = 88 000 ₽/.test(t3));
  await ctx.shot("wiz-x3-review-other", { jpeg: true });

  console.log("начать заново:", await click(/^Начать заново/));
  await ctx.sleep(500);
  await ctx.shot("wiz-x4-startover-confirm", { jpeg: true });
  console.log("подтвердить:", await click(/^Начать заново$/, 'div[class*="z-[1100]"] button'));
  await ctx.sleep(600);
  const t4 = await text();
  console.log("  снова шаг 1:", /Куда добавляем технику/.test(t4), "| баннер ушёл:", !/Продолжаем черновик/.test(t4));
  await page.keyboard.press("Escape");
  await ctx.sleep(500);

  // Каталог моделей
  console.log("модели:", await click(/^Модели$/, "button"));
  await ctx.sleep(1500);
  await ctx.shot("models-now-1-list", { jpeg: true });
  console.log("фильтр продаём:", await click(/^Продаём/, "button"));
  await ctx.sleep(500);
  await ctx.shot("models-now-2-sale-filter", { jpeg: true });
  console.log("все:", await click(/^Все\s*\d/, "button"));
  console.log("новая модель:", await click(/Добавить модель/, "button"));
  await ctx.sleep(1000);
  await ctx.shot("models-now-3-form", { jpeg: true });
  const sw = (label) =>
    page.evaluate((label) => {
      const b = [...document.querySelectorAll('button[role="switch"]')].find((x) => x.textContent.includes(label));
      b?.click();
      return b?.getAttribute("aria-checked");
    }, label);
  console.log("продаём:", await sw("Продаём"));
  console.log("сдаём:", await sw("Сдаём в аренду"));
  await ctx.sleep(400);
  const t5 = await text();
  console.log("  тарифы скрыты:", !/1–2 дня/.test(t5.split("Так будет выглядеть")[0]), "| пометка:", /Тарифы не нужны/.test(t5));
  await ctx.shot("models-now-4-form-sale-only", { jpeg: true });
  console.log("продаём выкл:", await sw("Продаём"));
  await ctx.sleep(300);
  const t6 = await text();
  console.log("  ошибка без назначения:", /Отметьте хотя бы одно/.test(t6));
  console.log("  кнопка заблокирована:", await page.evaluate(() =>
    [...document.querySelectorAll("button")].find((b) => /Создать модель/.test(b.textContent))?.disabled,
  ));
  await page.keyboard.press("Escape");
}
