/** Партия 2, часть D: п.15 выкуп задним числом (свой график, «оплачено», дата платежа) и п.12 договор в окне. */
export async function run(page, ctx) {
  const text = () => page.evaluate(() => document.body.innerText);
  const clickBtn = (re) =>
    page.evaluate((src) => {
      const r = new RegExp(src, "i");
      const b = [...document.querySelectorAll("button")].find((x) => r.test((x.textContent || "").trim()) && !x.disabled);
      if (b) b.click();
      return b ? (b.textContent || "").trim().slice(0, 40) : null;
    }, re.source);
  const setInput = (finder, value) =>
    page.evaluate(
      ({ finder, value }) => {
        const inputs = [...document.querySelectorAll("input")];
        const el = inputs.find((i) => new RegExp(finder).test(i.placeholder || "") || (finder.startsWith("type:") && i.type === finder.slice(5)));
        if (!el) return false;
        const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        s.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      },
      { finder, value },
    );
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);

  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(2500);
  await clickBtn(/^Доступные$/);
  await ctx.sleep(1000);
  // Jog #99 — тестовая техника из категории «Выкуп»
  const started = await page.evaluate(() => {
    const row = [...document.querySelectorAll("button")].find((b) => /Оформить выкуп/.test(b.textContent || "") && /TEST-BUYOUT-15|Jog/.test(b.parentElement?.textContent || ""));
    const rows = [...document.querySelectorAll("div")].filter((d) => /TEST-BUYOUT-15/.test(d.textContent || "") && d.querySelector("button"));
    const target = rows.length ? [...rows[rows.length - 1].querySelectorAll("button")].find((b) => /Оформить выкуп/.test(b.textContent || "")) : row;
    if (!target) return false;
    target.click();
    return true;
  });
  await ctx.sleep(1500);
  console.log("шаг 0:", JSON.stringify({ мастер: started }));

  // Шаг 0 — клиент «Покупалов»
  await setInput("Имя или телефон", "Покупалов");
  await ctx.sleep(800);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Покупалов/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(500);
  await clickBtn(/^Далее/);
  await ctx.sleep(1500);
  // Шаг 1 — чёрные списки
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /чёрн|черн/i.test(x.textContent || "") && !/Далее|Назад/.test(x.textContent || ""));
    b?.click();
  });
  await ctx.sleep(400);
  await clickBtn(/^Далее/);
  await ctx.sleep(1500);
  // Шаг 2 — техника: Jog #99 уже выбран (presetScooterId)
  let t = await text();
  console.log("шаг 2:", JSON.stringify({ техника: /TEST-BUYOUT-15/.test(t), подсказка: /категории «Выкуп»/.test(t) }));
  await ctx.shot("v8-buyout-wizard-stock", { jpeg: true });
  await clickBtn(/^Далее/);
  await ctx.sleep(1500);
  // Шаг 3 — условия: взнос 10 000, первый платёж задним числом, свой график
  await setInput("type:date", "2026-07-01");
  await ctx.sleep(300);
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll("input")].filter((i) => i.inputMode === "numeric");
    // второе числовое поле — взнос (первое — стоимость)
    const down = inputs[1];
    if (down) {
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      s.call(down, "10000");
      down.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await ctx.sleep(400);
  await clickBtn(/^Свой$/);
  await ctx.sleep(800);
  t = await text();
  const sumLine = (t.match(/[\d ]+ из [\d ]+ ₽[^\n]*/) || [])[0];
  console.log("шаг 3 свой график:", JSON.stringify({ строк: (t.match(/оплачено/g) || []).length, сумма: sumLine, поровну: /Разбить поровну/.test(t) }));
  // первая строка — оплачено
  await page.evaluate(() => {
    const cb = [...document.querySelectorAll("input[type=checkbox]")][0];
    cb?.click();
  });
  await ctx.sleep(600);
  t = await text();
  console.log("шаг 3 оплачено:", JSON.stringify({ уже: (t.match(/Уже оплачено [\d ]+ ₽[^\n]*/) || [])[0] }));
  await ctx.shot("v8-buyout-custom-schedule", { jpeg: true });
  const next3 = await clickBtn(/^Далее/);
  await ctx.sleep(1800);
  t = await text();
  console.log("шаг 4:", JSON.stringify({ далее: next3, метка: /Метка установлена/.test(t), ошибка: (t.match(/График не сходится[^\n]*/) || [])[0] ?? null }));
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((x) => /Метка установлена/.test(x.textContent || ""))?.click();
  });
  await ctx.sleep(400);
  await clickBtn(/^Далее/);
  await ctx.sleep(1500);
  // Шаг 5 — договор
  t = await text();
  console.log("шаг 5:", JSON.stringify({ график: (t.match(/График\s*\n?[^\n]*своему графику[^\n]*/) || [])[0]?.replace(/\n/g, " "), первый: (t.match(/Первый платёж\s*\n?[^\n]*/) || [])[0]?.replace(/\n/g, " ") }));
  await clickBtn(/Сформировать договор/);
  await ctx.sleep(3500);
  const contract = await page.evaluate(() => {
    const f = document.querySelector("iframe");
    const doc = f?.contentDocument;
    const html = doc?.body?.innerText || "";
    return { модалка: !!document.querySelector("iframe"), печать: [...document.querySelectorAll("button")].some((b) => /Печать/.test(b.textContent || "")), график: /График платежей/.test(html), оплачено: (html.match(/\(оплачено\)/g) || []).length, строк: (html.match(/\d{2}\.\d{2}\.\d{4}\s+[\d ]+ ₽/g) || []).length, текст: /согласно графику/.test(html) };
  });
  console.log("п.12 договор в окне:", JSON.stringify(contract));
  await ctx.shot("v8-buyout-contract-modal", { jpeg: true });
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => (b.getAttribute("title") || "").includes("Закрыть") || (b.getAttribute("aria-label") || "").includes("Закрыть"))?.click();
  });
  await ctx.sleep(600);
  await page.keyboard.press("Escape");
  await ctx.sleep(600);
  // если мастер закрылся Escape — переоткрыть сделку? Проверим, есть ли кнопка подписания
  let signed = await clickBtn(/Подписать и начать выкуп/);
  if (!signed) {
    // мастер закрылся — открыть черновик из списка «Выкупы» → «Продолжить»
    await clickBtn(/^Выкупы$/);
    await ctx.sleep(1000);
    await page.evaluate(() => {
      [...document.querySelectorAll("button")].find((b) => /Покупалов/.test(b.textContent || "") && /Договор сформирован|Черновик/.test(b.textContent || ""))?.click();
    });
    await ctx.sleep(1500);
    await clickBtn(/Продолжить/);
    await ctx.sleep(1500);
    signed = await clickBtn(/Подписать и начать выкуп/);
  }
  await ctx.sleep(2500);
  t = await text();
  console.log("подписание:", JSON.stringify({ кнопка: signed, тост: /Выкуп начат/.test(t) }));

  // Карточка сделки: график с оплаченной строкой, платёж задним числом
  await clickBtn(/^Выкупы$/);
  await ctx.sleep(1200);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Покупалов/.test(b.textContent || "") && /Выплачивается/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1500);
  t = await text();
  console.log("карточка:", JSON.stringify({ график: (t.match(/График платежей · \d+/) || [])[0], поступления: /Поступления/.test(t), ранее: /Оплачено ранее/.test(t) }));
  await ctx.shot("v8-buyout-deal-backdated", { jpeg: true });
  await clickBtn(/Принять платёж/);
  await ctx.sleep(1000);
  t = await text();
  console.log("платёж:", JSON.stringify({ дата: /Дата платежа/.test(t) }));
  await setInput("type:date", "2026-08-01");
  await ctx.sleep(400);
  t = await text();
  console.log("платёж задним числом:", JSON.stringify({ метка: /задним числом/.test(t) }));
  await ctx.shot("v8-buyout-payment-date", { jpeg: true });
  await page.keyboard.press("Escape");
  await ctx.sleep(500);

  /* ---- мобила: шаг условий мастера с своим графиком (новый черновик не создаём — смотрим диалог платежа) ---- */
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4000);
  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(2500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((x) => (x.getAttribute("title") || "") === "Выкупы")?.click();
  });
  await ctx.sleep(1200);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Покупалов/.test(b.textContent || "") && /Выплачивается/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1500);
  await clickBtn(/Принять платёж/);
  await ctx.sleep(1000);
  t = await text();
  console.log("моб платёж:", JSON.stringify({ дата: /Дата платежа/.test(t), overflowX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) }));
  await ctx.shot("v8-mobile-buyout-payment", { jpeg: true });
}
