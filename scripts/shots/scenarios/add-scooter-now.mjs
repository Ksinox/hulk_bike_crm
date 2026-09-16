/**
 * «Развитие» 2.91/2.92 и слайды 2.0.1, СТАЛО (16.09): мастер «Новая техника»
 * по шагам на компьютере, телефоне и планшете; модели «сдаём/продаём».
 * SUBMIT=1 — сохранить демонстрационную партию (рамы SA36J-99160x, после
 * съёмки удаляются) и снять её в поиске по номеру партии.
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const BATCH = "Партия 7 · сентябрь";

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
        return el ? (el.textContent || "").trim().slice(0, 30) : null;
      },
      re.source,
      sel,
    );
  const paste = (selector, value) =>
    page.evaluate(
      (selector, value) => {
        const el = document.querySelector(selector);
        el.focus();
        const dt = new DataTransfer();
        dt.setData("text/plain", value);
        el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      },
      selector,
      value,
    );
  const clearDraft = () =>
    page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith("hulk-draft:add-scooter")) localStorage.removeItem(k);
    });
  const dismissToasts = () =>
    page.evaluate(() => {
      // Только крестик: у тоста после добавления есть «Отменить».
      document
        .querySelectorAll('[role="alert"] button')
        .forEach((b) => !b.textContent.trim() && b.click());
    });
  const scrollBody = (y) =>
    page.evaluate((y) => {
      const box = document.querySelector("[data-wizard] .overflow-y-auto");
      if (box) box.scrollTop = y;
    }, y);
  const open = async (garageTab) => {
    await page.evaluate((t) => t && localStorage.setItem("hulk.garageTab", t), garageTab);
    await clearDraft();
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(5000);
    await ctx.gotoRoute("fleet");
    await ctx.sleep(2000);
  };
  // Цена «для всех» теперь подставляется сама — вписываем поверх.
  const setValue = async (selector, value) => {
    await page.focus(selector);
    await page.keyboard.down("Control");
    await page.keyboard.press("KeyA");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    if (value) await page.keyboard.type(value);
  };
  const grid = [1, 2, 3, 4, 5].map((i) => `SA36J-99160${i}\tA3E1-2209${i}4`).join("\n");

  // ───────── компьютер ─────────
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await open("sale");
  console.log("добавить:", await click(/Добавить скутер/, "button"));
  await ctx.sleep(1200);
  await ctx.shot("addsc-now-1-category", { jpeg: true });

  console.log("продажа:", await click(/^На продажу/));
  await ctx.sleep(700);
  await click(/^Jog/);
  await click(/^5$/);
  await page.type('input[placeholder^="Например: Партия"]', BATCH);
  const price = await page.$('input[placeholder="85000"]');
  if (price) await price.type("52000");
  await page.evaluate(() => document.activeElement?.blur());
  await ctx.sleep(500);
  await ctx.shot("addsc-now-2-sale-model", { jpeg: true });

  await click(/^Далее/);
  await ctx.sleep(900);
  await page.type('input[data-row="-1"][data-col="year"]', "2021");
  await page.type('input[data-row="-1"][data-col="color"]', "Серебристый");
  await setValue('input[data-row="-1"][data-col="price"]', "95000");
  await paste('input[data-row="0"][data-col="vin"]', grid);
  await ctx.sleep(400);
  await page.type('input[data-row="2"][data-col="price"]', "99000");
  await page.type('input[data-row="3"][data-col="note"]', "скол на пластике");
  await page.evaluate(() => document.activeElement?.blur());
  await dismissToasts();
  await ctx.sleep(600);
  await ctx.shot("addsc-now-3-table", { jpeg: true });

  // Дубль рамы — подсветка до сохранения
  await page.focus('input[data-row="4"][data-col="vin"]');
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.type("SA36J-991601");
  await page.evaluate(() => document.activeElement?.blur());
  await ctx.sleep(500);
  await ctx.shot("addsc-now-4-dup", { jpeg: true });
  await page.focus('input[data-row="4"][data-col="vin"]');
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.type("SA36J-991605");
  await page.evaluate(() => document.activeElement?.blur());
  await ctx.sleep(300);

  await click(/^Проверить/);
  await ctx.sleep(900);
  await ctx.shot("addsc-now-5-review", { jpeg: true });

  if (process.env.SUBMIT === "1") {
    console.log("сохранить:", await click(/^Добавить 5 единиц/));
    await ctx.sleep(2500);
    await dismissToasts();
    const search = await page.$('input[placeholder^="Номер, модель"]');
    await search?.type("партия 7");
    await ctx.sleep(1200);
    await ctx.shot("addsc-now-6-result", { jpeg: true });
  }

  // Аренда: свободные номера
  await open("rental");
  await click(/Добавить скутер/, "button");
  await ctx.sleep(900);
  await click(/^В аренду/);
  await ctx.sleep(600);
  await click(/^Jog/);
  await click(/^2$/);
  await page.evaluate(() => document.activeElement?.blur());
  await ctx.sleep(400);
  await scrollBody(2000);
  await ctx.sleep(300);
  await ctx.shot("addsc-now-7-rent-slots", { jpeg: true });
  await page.keyboard.press("Escape");
  await ctx.sleep(500);

  // Модели
  await clearDraft();
  console.log("модели:", await click(/^Модели$/, "button"));
  await ctx.sleep(1500);
  await ctx.shot("models-now-1-list", { jpeg: true });
  await click(/Добавить модель/, "button");
  await ctx.sleep(1000);
  await page.type('input[placeholder="Yamaha Jog"]', "Yamaha Jog AY01");
  await page.evaluate(() => {
    const sw = (label) =>
      [...document.querySelectorAll('button[role="switch"]')].find((x) => x.textContent.includes(label))?.click();
    sw("Продаём");
    sw("Сдаём в аренду");
    document.activeElement?.blur();
  });
  await ctx.sleep(500);
  await ctx.shot("models-now-2-form", { jpeg: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });

  // ───────── телефон ─────────
  await page.setUserAgent(PHONE_UA);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await open(null);
  console.log("телефон:", await click(/^\+?\s*Скутер$/, "button"));
  await ctx.sleep(1200);
  await ctx.shot("addsc-now-m1-category", { jpeg: true });
  await click(/^В аренду/);
  await ctx.sleep(700);
  await click(/^Jog/);
  await click(/^2$/);
  await page.type('input[placeholder^="Например: Партия"]', BATCH);
  await page.evaluate(() => document.activeElement?.blur());
  await ctx.sleep(400);
  await ctx.shot("addsc-now-m2-model", { jpeg: true });
  await click(/^Далее/);
  await ctx.sleep(800);
  await page.type('[data-wizard] input[placeholder="2020"]', "2021");
  await page.type('[data-wizard] input[placeholder="Чёрный"]', "Серебристый");
  await setValue('[data-wizard] input[placeholder="150000"]', "150000");
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("[data-wizard] button")].find((x) => /^Одинаковое для всех/.test(x.textContent.trim()));
    b?.click();
  });
  await ctx.sleep(300);
  const vins = await page.$$('[data-wizard] input[placeholder="SA36J-605232"]');
  if (vins[0]) await vins[0].type("SA36J-991611");
  const engines = await page.$$('[data-wizard] input[placeholder="A3E1-123456"]');
  if (engines[0]) await engines[0].type("A3E1-220911");
  await page.evaluate(() => document.activeElement?.blur());
  await ctx.sleep(400);
  await ctx.shot("addsc-now-m3-cards", { jpeg: true });

  // ───────── планшет лёжа ─────────
  await page.setUserAgent(IPAD_UA);
  await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
  await open(null);
  await click(/^\+?\s*Скутер$/, "button");
  await ctx.sleep(1000);
  await click(/^На продажу/);
  await ctx.sleep(600);
  await click(/^Jog/);
  await click(/^5$/);
  await page.type('input[placeholder^="Например: Партия"]', BATCH);
  await click(/^Далее/);
  await ctx.sleep(900);
  await page.type('input[data-row="-1"][data-col="year"]', "2021");
  await page.type('input[data-row="-1"][data-col="color"]', "Серебристый");
  await setValue('input[data-row="-1"][data-col="price"]', "95000");
  await paste('input[data-row="0"][data-col="vin"]', grid.replace(/99160/g, "99162"));
  await page.evaluate(() => document.activeElement?.blur());
  await dismissToasts();
  await ctx.sleep(600);
  await ctx.shot("addsc-now-t1-table", { jpeg: true });
  await clearDraft();
}
