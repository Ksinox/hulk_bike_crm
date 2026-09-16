/**
 * 16.09: подсказки цвета — в мастере (таблица и карточки) и в правке
 * техники. Ничего не сохраняем.
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

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
  const options = () =>
    page.evaluate(() => [...document.querySelectorAll('[role="listbox"] [role="option"]')].map((o) => o.textContent.trim()));
  const clearDraft = () =>
    page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith("hulk-draft:add-scooter")) localStorage.removeItem(k);
    });

  // ── компьютер: таблица
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await clearDraft();
  await page.evaluate(() => localStorage.setItem("hulk.garageTab", "sale"));
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2000);
  await click(/Добавить скутер/, "button");
  await ctx.sleep(900);
  await click(/^На продажу/);
  await ctx.sleep(600);
  await click(/^Jog/);
  await click(/^2$/);
  await click(/^Далее/);
  await ctx.sleep(800);
  await page.focus('input[data-row="-1"][data-col="color"]');
  await ctx.sleep(400);
  console.log("фокус, список:", (await options()).join(" | "));
  await ctx.shot("color-d1-focus", { jpeg: true });
  await page.keyboard.type("бе");
  await ctx.sleep(300);
  console.log("«бе»:", (await options()).join(" | "));
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await ctx.sleep(300);
  const v = await page.$eval('input[data-row="-1"][data-col="color"]', (i) => i.value);
  console.log("выбрано стрелкой+Enter:", v, "| список закрыт:", (await options()).length === 0);
  // своя строка: вписали новый цвет в строку 1 → строка 2 его предлагает
  await page.focus('input[data-row="0"][data-col="color"]');
  await page.keyboard.type("Изумрудный");
  await page.keyboard.press("Enter"); // таблица: вниз на строку 2
  await ctx.sleep(400);
  const focused = await page.evaluate(() => `${document.activeElement?.dataset.row}:${document.activeElement?.dataset.col}`);
  console.log("Enter без выбора — вниз:", focused);
  console.log("строка 2 предлагает:", (await options()).slice(0, 4).join(" | "));
  await ctx.shot("color-d2-row", { jpeg: true });
  // клик мышью по варианту
  const box = await page.evaluate(() => {
    const o = [...document.querySelectorAll('[role="listbox"] [role="option"]')].find((x) => /Изумрудный/.test(x.textContent));
    if (!o) return null;
    const r = o.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (box) await page.mouse.click(box.x, box.y);
  await ctx.sleep(300);
  console.log("клик мышью:", await page.$eval('input[data-row="1"][data-col="color"]', (i) => i.value));
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await ctx.sleep(200);
  const openBefore = (await options()).length > 0;
  await page.keyboard.press("Escape");
  await ctx.sleep(300);
  console.log("список был открыт:", openBefore, "| Esc закрыл список:", (await options()).length === 0, "| мастер открыт:", !!(await page.$("[data-wizard]")));
  await page.keyboard.press("Escape");
  await ctx.sleep(500);
  await clearDraft();

  // ── телефон: карточки
  await page.setUserAgent(PHONE_UA);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(1800);
  await click(/^\+?\s*Скутер$/, "button");
  await ctx.sleep(900);
  await click(/^На продажу/);
  await ctx.sleep(600);
  await click(/^Jog/);
  await click(/^Далее/);
  await ctx.sleep(800);
  const color = await page.$('[data-wizard] input[placeholder="Чёрный"]');
  await color?.tap();
  await ctx.sleep(500);
  console.log("телефон, список:", (await options()).join(" | "));
  await ctx.shot("color-m1-focus", { jpeg: true });
  const tapBox = await page.evaluate(() => {
    const o = document.querySelector('[role="listbox"] [role="option"]');
    if (!o) return null;
    const r = o.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height };
  });
  console.log("высота строки на телефоне:", tapBox?.h);
  if (tapBox) await page.touchscreen.tap(tapBox.x, tapBox.y);
  await ctx.sleep(400);
  console.log("касание выбрало:", await page.evaluate(() => document.querySelector('[data-wizard] input[placeholder="Чёрный"]')?.value));
  await clearDraft();
}
