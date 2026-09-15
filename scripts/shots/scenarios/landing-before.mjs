/**
 * Кадры «БЫЛО» для пунктов 2.32–2.49 «Развития» — процесс по шагам.
 * Запуск на СТАРОЙ сборке (a02c8599): SHOT_BASE=http://localhost:5173
 * SHOT_API=https://api-preview… Имена кадров: b-<пункт>-<шаг>.jpg
 */
export async function run(page, ctx) {
  const text = () => page.evaluate(() => document.body.innerText);
  const click = (re, opts = {}) =>
    page.evaluate(
      ({ src, tag }) => {
        const r = new RegExp(src, "i");
        const b = [...document.querySelectorAll(tag || "button")].find(
          (x) => r.test((x.textContent || "").trim()) && !x.disabled,
        );
        if (b) b.click();
        return b ? (b.textContent || "").trim().slice(0, 40) : null;
      },
      { src: re.source, tag: opts.tag },
    );
  const desktop = async () => {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await ctx.sleep(3500);
  };
  const mobile = async () => {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: "domcontentloaded" });
    await ctx.sleep(4000);
  };
  const S = (name) => ctx.shot(name, { jpeg: true });

  await desktop();

  /* 2.32 журнал техники: Скутеры (вкладки) → Журнал (если был) ; мобила без журнала */
  await ctx.gotoRoute("fleet"); await ctx.sleep(2500);
  await S("b-232-1-fleet-tabs");
  if (await click(/^Журнал$/)) { await ctx.sleep(1500); await S("b-232-2-journal"); }

  /* 2.33 детализация выплат: Партнёрка → Инвесторы (плитка без кнопки) → карточка инвестора */
  await ctx.gotoRoute("partners"); await ctx.sleep(2500);
  await S("b-233-1-partners");
  await click(/^Инвесторы$/); await ctx.sleep(1500);
  await S("b-233-2-investors-tile");

  /* 2.34 выручка: дашборд → карточка выручки (с электро) → развернуть */
  await ctx.gotoRoute("dashboard"); await ctx.sleep(3000);
  await S("b-234-1-dashboard");
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.getAttribute("title") || "").match(/на весь экран|развернуть|Развернуть/i));
    b?.click();
  });
  await ctx.sleep(1500);
  await S("b-234-2-revenue-full");
  await page.keyboard.press("Escape"); await ctx.sleep(500);

  /* 2.35 возвраты: Аренды → плашки (5) → чипсы фильтров */
  await ctx.gotoRoute("rentals"); await ctx.sleep(3000);
  await S("b-235-1-rentals-kpi");
  await click(/^Завершены$/); await ctx.sleep(1200);
  await S("b-235-2-rentals-completed");

  /* 2.36 ревизия: Скутеры → нет кнопки; 2.39 метка: вкладка Продажа */
  await ctx.gotoRoute("fleet"); await ctx.sleep(2500);
  await S("b-236-1-fleet-no-revision");
  await click(/^Продажа$/); await ctx.sleep(1200);
  await S("b-239-1-fleet-sale-list");
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("[role=button]")].find((x) => /Jog|Gear/.test(x.textContent || "") && /Продан/i.test(x.textContent || ""));
    row?.click();
  });
  await ctx.sleep(1800);
  await S("b-239-2-fleet-sale-card");

  /* 2.41 номер: Скутеры → Аренда → карточка (дровер без поля номера) */
  await click(/^Аренда$/); await ctx.sleep(1200);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("[role=button]")].find((x) => /Jog|Gear/.test(x.textContent || "") && /Готов|В аренде/i.test(x.textContent || ""));
    row?.click();
  });
  await ctx.sleep(1800);
  await S("b-241-1-fleet-card-drawer");
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find((d) => /Покупка и стоимость/.test(d.textContent || "") && (d.textContent || "").length < 400);
    el?.scrollIntoView({ block: "start" });
  });
  await ctx.sleep(600);
  await S("b-241-2-fleet-card-specs");

  /* 2.47/2.48 выкуп: Выкуп → вкладки → Новый выкуп → клиент → проверка → техника (нет Jog №3) */
  await ctx.gotoRoute("rassrochki"); await ctx.sleep(2500);
  await S("b-247-1-buyout-tabs");
  const opened = await click(/Новый выкуп|Оформить выкуп|Новая сделка/);
  if (!opened) {
    await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => /Новая сделка/.test(b.textContent || ""))?.click(); });
    await ctx.sleep(600);
    await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => /Выкуп/.test(b.textContent || "") && /рассрочк|Выкуп/i.test(b.textContent || ""))?.click(); });
  }
  await ctx.sleep(1500);
  await S("b-248-1-wizard-client");
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) => /Имя или телефон/.test(i.placeholder || ""));
    if (inp) { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; s.call(inp, "Покупалов"); inp.dispatchEvent(new Event("input", { bubbles: true })); }
  });
  await ctx.sleep(800);
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => /Покупалов/.test(b.textContent || ""))?.click(); });
  await ctx.sleep(500);
  await click(/^Далее/); await ctx.sleep(1200);
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => /чёрн|черн/i.test(x.textContent || "") && !/Далее|Назад/.test(x.textContent || ""))?.click(); });
  await ctx.sleep(400);
  await click(/^Далее/); await ctx.sleep(1500);
  await S("b-248-2-wizard-scooter");
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) => /VIN/.test(i.placeholder || ""));
    if (inp) { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; s.call(inp, "FGHFH"); inp.dispatchEvent(new Event("input", { bubbles: true })); }
  });
  await ctx.sleep(800);
  await S("b-248-3-wizard-vin-typed");
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) => /VIN/.test(i.placeholder || ""));
    if (inp) { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; s.call(inp, ""); inp.dispatchEvent(new Event("input", { bubbles: true })); }
  });
  await ctx.sleep(500);
  // 2.49 условия без своего графика
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => /Jog|Gear/.test(b.textContent || "") && /VIN/.test(b.textContent || ""))?.click(); });
  await ctx.sleep(500);
  await click(/^Далее/); await ctx.sleep(1500);
  await S("b-249-1-wizard-terms");
  await page.keyboard.press("Escape"); await ctx.sleep(600);
  // карточка сделки → Принять платёж (без даты)
  await click(/^Выкупы$/); await ctx.sleep(1000);
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => /Козлов/.test(b.textContent || "") && /Выплачивается/.test(b.textContent || ""))?.click(); });
  await ctx.sleep(1500);
  await S("b-249-2-deal-card");
  await click(/Принять платёж/); await ctx.sleep(1000);
  await S("b-249-3-payment-dialog");
  await page.keyboard.press("Escape"); await ctx.sleep(400);
  // 2.46 договор: кнопка «Договор» открывала новую вкладку
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("div, section")].find((d) => /Документы/.test(d.textContent || "") && /Договор/.test(d.textContent || "") && (d.textContent || "").length < 120);
    el?.scrollIntoView({ block: "center" });
  });
  await ctx.sleep(500);
  await S("b-246-1-deal-documents");

  /* 2.40 план, 2.44 график, 2.45 прибыль: Продажи */
  await ctx.gotoRoute("sales"); await ctx.sleep(2500);
  await S("b-245-1-sales-overview");
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter((x) => /Задать план|Изменить/.test((x.textContent || "").trim()));
    const b = btns.find((x) => { let el = x; for (let i = 0; i < 8 && el; i++) { if ((el.textContent || "").includes("План продаж")) return true; el = el.parentElement; } return false; });
    b?.click();
  });
  await ctx.sleep(1200);
  await S("b-240-1-plan-dialog");
  await click(/^Отмена$/); await ctx.sleep(400);
  await page.evaluate(() => { document.querySelector(".cursor-grab, .cursor-grabbing")?.scrollIntoView({ block: "center" }); });
  await ctx.sleep(300);
  await S("b-244-1-sales-chart");
  await click(/^Сделки$/); await ctx.sleep(1200);
  await S("b-245-2-sales-deals");
  await page.evaluate(() => { [...document.querySelectorAll("tr, button")].find((x) => /#0010/.test(x.textContent || ""))?.click(); });
  await ctx.sleep(1500);
  await S("b-245-3-sale-drawer");
  await S("b-242-1-sale-drawer-documents");

  /* 2.37 анкета покупателя: Продажи → Заявки → анкета → Оформить → клиент → (аренда!) */
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => /^Заявки/.test((b.textContent || "").trim()))?.click(); });
  await ctx.sleep(1500);
  await S("b-237-1-sale-applications");
  await page.evaluate(() => { [...document.querySelectorAll("button, [role=button], li, div")].find((b) => /Покупкин/.test(b.textContent || "") && (b.textContent || "").length < 300)?.click(); });
  await ctx.sleep(1500);
  await S("b-237-2-application-open");
  const conv = await click(/Оформить|Принять|Создать клиента/);
  await ctx.sleep(1800);
  await S("b-237-3-client-form");
  console.log("2.37 кнопка:", conv);

  /* 2.38 долг: Партнёрка → аренда с долгом → Принять оплату */
  await ctx.gotoRoute("partners"); await ctx.sleep(2500);
  await page.evaluate(() => { [...document.querySelectorAll("tr, [role=button], button")].find((x) => /Тестов Долг/.test(x.textContent || ""))?.click(); });
  await ctx.sleep(1800);
  await S("b-238-1-partner-rental-card");
  await click(/Принять оплату/); await ctx.sleep(1200);
  await S("b-238-2-payment-dialog");
  await page.keyboard.press("Escape"); await ctx.sleep(400);

  /* мобила: журнал (нет), метка, возвраты, ревизия */
  await mobile();
  await ctx.gotoRoute("fleet"); await ctx.sleep(2500);
  await S("b-232-3-mobile-fleet");
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => /Проданы/.test(x.textContent || ""))?.click(); });
  await ctx.sleep(1000);
  await S("b-239-3-mobile-sold");
  await ctx.gotoRoute("rentals"); await ctx.sleep(2500);
  await S("b-235-3-mobile-rentals");
}
