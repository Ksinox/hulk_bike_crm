/** Кадры «СТАЛО» — недостающие шаги процесса для пунктов 2.32–2.49. */
export async function run(page, ctx) {
  const text = () => page.evaluate(() => document.body.innerText);
  const S = (n) => ctx.shot(n, { jpeg: true });
  const click = (needle, exact = false) =>
    page.evaluate(
      ({ needle, exact }) => {
        const b = [...document.querySelectorAll("button")].find((x) => {
          const t = (x.textContent || "").trim();
          return (exact ? t === needle : t.includes(needle)) && !x.disabled;
        });
        if (b) b.click();
        return b ? (b.textContent || "").trim().slice(0, 40) : null;
      },
      { needle, exact },
    );
  const setInput = (re, value) =>
    page.evaluate(
      ({ re, value }) => {
        const el = [...document.querySelectorAll("input")].find((i) => new RegExp(re).test(i.placeholder || ""));
        if (!el) return false;
        const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        s.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      },
      { re, value },
    );

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);

  /* ============ Скутеры: 2.32 журнал, 2.36 ревизия, 2.39 метка, 2.41 номер ============ */
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);
  await click("Аренда", true);
  await ctx.sleep(1200);
  await S("a-236-1-fleet-revision-button"); // вкладки + кнопка «Ревизия парка»
  // журнал: вкладка → фильтр
  await click("Журнал", true);
  await ctx.sleep(1800);
  await S("a-232-1-journal-open");
  await click("Смена статуса", true);
  await ctx.sleep(1200);
  await S("a-232-2-journal-filter");
  // ревизия
  await click("Аренда", true);
  await ctx.sleep(1000);
  await click("Ревизия парка");
  await ctx.sleep(2500);
  console.log("ревизия:", JSON.stringify({ iframe: await page.evaluate(() => !!document.querySelector("iframe[srcdoc]")) }));
  await S("a-236-2-revision-sheet");
  await page.keyboard.press("Escape");
  await ctx.sleep(600);
  // метка «был в аренде» + карточка/номер
  await click("Продажа", true);
  await ctx.sleep(1200);
  await S("a-239-1-fleet-sale-mark");
  await click("Аренда", true);
  await ctx.sleep(1200);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("[role=button]")].find(
      (x) => /Jog|Gear/.test(x.textContent || "") && /ГОТОВ|В АРЕНДЕ/i.test(x.textContent || ""),
    );
    row?.click();
  });
  await ctx.sleep(2000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.getAttribute("title") || "").startsWith("Сменить номер"));
    b?.scrollIntoView({ block: "center" });
  });
  await ctx.sleep(600);
  await S("a-241-1-card-slot-field"); // поле «Номер в аренде» в карточке
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((x) => (x.getAttribute("title") || "").startsWith("Сменить номер"))?.click();
  });
  await ctx.sleep(900);
  console.log("номера:", JSON.stringify({ панель: /Номера в парке/.test(await text()), занятые: /освободится/.test(await text()) }));
  await S("a-241-2-slot-picker");
  await click("Добавить номера");
  await ctx.sleep(800);
  await S("a-241-3-slot-add-numbers");
  await page.keyboard.press("Escape");
  await ctx.sleep(500);

  /* ============ 2.33 выплаты инвесторам ============ */
  await ctx.gotoRoute("partners");
  await ctx.sleep(2500);
  await click("Инвесторы", true);
  await ctx.sleep(1500);
  await S("a-233-1-investors-tile"); // плитка с кнопкой «Детализация»
  await click("Детализация", true);
  await ctx.sleep(1800);
  await S("a-233-2-payouts-dialog");
  await click("Всё время", true);
  await ctx.sleep(1500);
  await S("a-233-3-payouts-all");
  await page.keyboard.press("Escape");
  await ctx.sleep(600);

  /* ============ 2.34 выручка без электро ============ */
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(3000);
  await S("a-234-1-dashboard-revenue");

  /* ============ 2.35 возвраты, 2.38 долг ============ */
  await ctx.gotoRoute("rentals");
  await ctx.sleep(3000);
  await S("a-235-1-kpi-today");
  await click("Неделя", true);
  await ctx.sleep(900);
  await S("a-235-2-kpi-week");
  await page.evaluate(() => {
    [...document.querySelectorAll("[role=button]")].find((x) => /Возвраты/.test(x.textContent || ""))?.click();
  });
  await ctx.sleep(1500);
  console.log("возвраты:", JSON.stringify({ строк: ((await text()).match(/#00\d\d/g) || []).length }));
  await S("a-235-3-returns-list");
  // долг: аренда #0047 (тестовая партнёрская)
  await click("Активные", true);
  await ctx.sleep(1200);
  await page.evaluate(() => {
    [...document.querySelectorAll("tr, [role=button]")].find((x) => /Тестов Долг/.test(x.textContent || ""))?.click();
  });
  await ctx.sleep(2000);
  const t38 = await text();
  console.log("долг до оплаты:", JSON.stringify({ долг: (t38.match(/ДОЛГ\s*\n?\s*[\d ]+ ₽/) || [])[0]?.replace(/\n/g, " ") }));
  await S("a-238-1-rental-debt");
  await click("Принять оплату");
  await ctx.sleep(1600);
  await S("a-238-2-payment-dialog");
  await page.keyboard.press("Escape");
  await ctx.sleep(600);

  /* ============ Продажи: 2.40 план, 2.44 график, 2.45 прибыль, 2.37 анкета ============ */
  await ctx.gotoRoute("sales");
  await ctx.sleep(2500);
  await S("a-245-1-profit-blurred");
  await S("a-240-1-plan-card");
  // ключ директора
  await page.evaluate(() => {
    document.querySelector("[aria-label='Скрыто — доступно директору по ключу']")?.click();
  });
  await ctx.sleep(1500);
  await S("a-245-2-director-key");
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) => /ключ/i.test(i.placeholder || "") || i.type === "password");
    if (inp) {
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      s.call(inp, "2626");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await ctx.sleep(400);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Подтвердить|Показать|Открыть|Проверить/.test(b.textContent || "") && !b.disabled)?.click();
  });
  await ctx.sleep(1800);
  await S("a-245-3-profit-revealed");
  // график: столбики → линия
  await page.evaluate(() => {
    document.querySelector(".cursor-grab, .cursor-grabbing")?.scrollIntoView({ block: "center" });
  });
  await ctx.sleep(400);
  await S("a-244-1-chart-bars");
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => (b.getAttribute("title") || "") === "Линия")?.click();
  });
  await ctx.sleep(1200);
  await S("a-244-2-chart-line");
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => (b.getAttribute("title") || "") === "Столбики")?.click();
  });
  await ctx.sleep(600);
  // план: диалог с пресетами
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter((x) => /Задать план|Изменить/.test((x.textContent || "").trim()));
    const b = btns.find((x) => { let el = x; for (let i = 0; i < 8 && el; i++) { if ((el.textContent || "").includes("План продаж")) return true; el = el.parentElement; } return false; });
    b?.click();
  });
  await ctx.sleep(1400);
  await S("a-240-2-plan-dialog");
  await click("С 15 по 14", true);
  await ctx.sleep(700);
  await S("a-240-3-plan-period-15");
  await click("Отмена", true);
  await ctx.sleep(600);
  // скрыть прибыль обратно
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Скрыть прибыль/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(500);

  /* ---- 2.37: анкета покупателя → клиент → мастер ПРОДАЖИ ---- */
  await click("Заявки");
  await ctx.sleep(1800);
  await S("a-237-1-sale-applications");
  const openedRow = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("*")].filter((x) => /Покупкин/.test(x.textContent || "") && (x.textContent || "").length < 200);
    const row = rows[rows.length - 1];
    let el = row;
    for (let i = 0; i < 6 && el; i++) {
      if (el.tagName === "BUTTON" || el.getAttribute?.("role") === "button") { el.click(); return el.tagName; }
      el = el.parentElement;
    }
    row?.click();
    return "fallback";
  });
  await ctx.sleep(2000);
  const t37 = await text();
  console.log("заявка:", JSON.stringify({
    как: openedRow,
    покупка: /ПОКУПКА|покупк/i.test(t37),
    кнопки: await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => (b.textContent || "").trim()).filter((x) => /Оформить|Принять|Отклонить|Спам/.test(x)).slice(0, 6)),
  }));
  await S("a-237-2-application-card");
  const conv = await click("Оформить");
  await ctx.sleep(2200);
  console.log("оформить:", conv, JSON.stringify({ форма: /Новый клиент|ФИО/.test(await text()) }));
  await S("a-237-3-client-form");
}
