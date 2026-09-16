/**
 * «Развитие» 2.95–2.99, БЫЛО (16.09, до правок): «В продаже» без кнопки
 * добавления, таблица без подсказки цены и без проверки рамы, тост после
 * добавления без «Отменить», партия видна только поиском.
 * Сохраняет демонстрационную партию (рамы SA36J-99170x) — удалить после.
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const click = (re, sel = "button") =>
    page.evaluate(
      (src, sel) => {
        const rx = new RegExp(src);
        const els = [...document.querySelectorAll(sel)].filter((x) => {
          const r = x.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !x.disabled && rx.test((x.textContent || "").trim());
        });
        const el = els.sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.click();
        return el ? (el.textContent || "").trim().slice(0, 30) : null;
      },
      re.source,
      sel,
    );
  const W = "[data-wizard] button";

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await page.evaluate(() => {
    localStorage.setItem("hulk.garageTab", "sale");
    for (const k of Object.keys(localStorage)) if (k.startsWith("hulk-draft:add-scooter")) localStorage.removeItem(k);
  });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);

  // «Продажи → В продаже»
  await ctx.gotoRoute("sales");
  await ctx.sleep(1500);
  console.log("вкладка:", await click(/^В продаже$/));
  await ctx.sleep(1500);
  await ctx.shot("stock-was-d", { jpeg: true });

  // Таблица: рамы «не как у Jog», цена пустая
  await ctx.gotoRoute("fleet");
  await ctx.sleep(1800);
  await click(/Добавить скутер/);
  await ctx.sleep(900);
  await click(/^На продажу/, W);
  await ctx.sleep(600);
  await click(/^Jog/, W);
  await click(/^2$/, W);
  await page.type('input[placeholder^="Например: Партия"]', "Партия 8 · сентябрь");
  await click(/^Далее/, W);
  await ctx.sleep(800);
  await page.type('input[data-row="0"][data-col="vin"]', "SA36J-991701");
  await page.type('input[data-row="1"][data-col="vin"]', "UA06J-99170");
  await page.evaluate(() => document.activeElement?.blur());
  await ctx.sleep(400);
  await ctx.shot("addsc2-was-table", { jpeg: true });

  // Сохранить и снять тост без «Отменить»
  await page.focus('input[data-row="1"][data-col="vin"]');
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.type("SA36J-991702");
  await page.type('input[data-row="-1"][data-col="price"]', "95000");
  await page.evaluate(() => document.activeElement?.blur());
  await click(/^Проверить/, W);
  await ctx.sleep(800);
  console.log("сохранить:", await click(/^Добавить 2 единицы/, W));
  await ctx.sleep(1800);
  await ctx.shot("undo-was-toast", { jpeg: true });

  // Партия — только через поиск (без сводки)
  const search = await page.$('input[placeholder^="Номер, модель"]');
  await search?.type("партия 8");
  await ctx.sleep(1200);
  await ctx.shot("batch-was-search", { jpeg: true });

  // Телефон: «Продажи → В продаже»
  await page.setUserAgent(PHONE_UA);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("sales");
  await ctx.sleep(1500);
  console.log("телефон, вкладка:", await click(/^В продаже$/));
  await ctx.sleep(1500);
  await ctx.shot("stock-was-m", { jpeg: true });
  await ctx.gotoRoute("fleet");
  await ctx.sleep(1800);
  await ctx.shot("batch-was-m", { jpeg: true });
}
