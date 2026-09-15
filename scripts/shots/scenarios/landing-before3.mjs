/** Досъёмка «БЫЛО» №2: мастер выкупа через navigate(newSale), карточка заявки на покупку. */
export async function run(page, ctx) {
  const text = () => page.evaluate(() => document.body.innerText);
  const S = (n) => ctx.shot(n, { jpeg: true });
  const clickText = (t) =>
    page.evaluate((needle) => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => (x.textContent || "").trim().includes(needle) && !x.disabled,
      );
      if (b) b.click();
      return b ? (b.textContent || "").trim().slice(0, 40) : null;
    }, t);

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);

  /* ---- мастер выкупа прямым переходом ---- */
  await ctx.gotoRoute("rassrochki", { newSale: true });
  await ctx.sleep(2500);
  let t = await text();
  console.log("мастер открыт:", JSON.stringify({ шаги: /Клиент/.test(t) && /Техника/.test(t) && /Условия/.test(t) }));
  await S("b-248-1-wizard-client");
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) => /Имя или телефон/.test(i.placeholder || ""));
    if (inp) {
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      s.call(inp, "Покупалов");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await ctx.sleep(900);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Покупалов/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(500);
  await clickText("Далее");
  await ctx.sleep(1500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find(
      (x) => /чёрн|черн/i.test(x.textContent || "") && !/Далее|Назад/.test(x.textContent || ""),
    )?.click();
  });
  await ctx.sleep(400);
  await clickText("Далее");
  await ctx.sleep(1800);
  t = await text();
  console.log("шаг техники:", JSON.stringify({
    подсказка: (t.match(/Выберите технику[^\n]*/) || [])[0],
    строк: (t.match(/VIN /g) || []).length,
    естьJog3: /FGHFH/.test(t),
  }));
  await S("b-248-2-wizard-scooter");
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) => /Модель, VIN/.test(i.placeholder || ""));
    if (inp) {
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      s.call(inp, "FGHFH");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await ctx.sleep(1200);
  t = await text();
  console.log("после ввода VIN:", JSON.stringify({ строк: (t.match(/VIN /g) || []).length }));
  await S("b-248-3-wizard-vin-typed");
  // очистить и выбрать первую технику → условия
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) => /Модель, VIN/.test(i.placeholder || ""));
    if (inp) {
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      s.call(inp, "");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await ctx.sleep(700);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => / км · VIN/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(600);
  await clickText("Далее");
  await ctx.sleep(1800);
  t = await text();
  console.log("условия:", JSON.stringify({
    первыйПлатёж: /Первый платёж/.test(t),
    свойГрафик: /Свой/.test(t) && /График платежей/.test(t),
  }));
  await S("b-249-1-wizard-terms");
  await page.keyboard.press("Escape");
  await ctx.sleep(900);

  /* ---- анкета покупателя: карточка заявки ---- */
  await ctx.gotoRoute("sales");
  await ctx.sleep(2500);
  await clickText("Заявки");
  await ctx.sleep(1800);
  await S("b-237-1-sale-applications");
  const opened = await page.evaluate(() => {
    // строка заявки — кликабельный контейнер со стрелкой справа
    const cand = [...document.querySelectorAll("*")].filter(
      (x) => /Покупкин/.test(x.textContent || "") && (x.textContent || "").length < 200,
    );
    const row = cand[cand.length - 1];
    let el = row;
    for (let i = 0; i < 6 && el; i++) {
      if (el.tagName === "BUTTON" || el.getAttribute?.("role") === "button" || el.onclick) {
        el.click();
        return el.tagName;
      }
      el = el.parentElement;
    }
    row?.click();
    return "fallback:" + (row?.tagName ?? "none");
  });
  await ctx.sleep(2000);
  t = await text();
  console.log("карточка заявки:", JSON.stringify({
    как: opened,
    досье: /Паспорт|Досье|Селфи|Оформить/.test(t),
    кнопки: await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .map((b) => (b.textContent || "").trim())
        .filter((x) => x && x.length < 26 && !/Дашборд|Клиенты|Аренды|Скутеры|Продажи|Партнёрка|Ремонты|Должники|Документы|Сотрудники|Что нового|Развитие|Хранилище|Ещё/.test(x))
        .slice(0, 12),
    ),
  }));
  await S("b-237-2-application-open");
  const conv = await clickText("Оформить");
  await ctx.sleep(2200);
  t = await text();
  console.log("после «Оформить»:", JSON.stringify({ кнопка: conv, форма: /Новый клиент|ФИО/.test(t) }));
  await S("b-237-3-client-form");
}
