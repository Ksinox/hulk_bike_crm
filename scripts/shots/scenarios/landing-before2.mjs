/** Досъёмка «БЫЛО»: мастер выкупа, анкета покупателя → клиент → аренда, парк без ревизии. */
export async function run(page, ctx) {
  const text = () => page.evaluate(() => document.body.innerText);
  const S = (n) => ctx.shot(n, { jpeg: true });
  const clickText = (t) =>
    page.evaluate((needle) => {
      const b = [...document.querySelectorAll("button, [role=button], a")].find(
        (x) => (x.textContent || "").trim().includes(needle) && !x.disabled,
      );
      if (b) b.click();
      return b ? (b.textContent || "").trim().slice(0, 50) : null;
    }, t);

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);

  /* ---- парк: вкладка «Аренда» без кнопки «Ревизия парка» ---- */
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);
  await clickText("Аренда");
  await ctx.sleep(1500);
  console.log("парк:", JSON.stringify({ ревизия: (await text()).includes("Ревизия парка") }));
  await S("b-236-1-fleet-no-revision");

  /* ---- мастер выкупа: Новая сделка → Выкуп → шаги ---- */
  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(2500);
  await S("b-247-1-buyout-tabs");
  await clickText("Новая сделка");
  await ctx.sleep(900);
  await S("b-248-0-new-deal-menu");
  await page.evaluate(() => {
    const item = [...document.querySelectorAll("button, [role=button], div")].find(
      (x) => /^Выкуп/.test((x.textContent || "").trim()) && /еженедельными платежами|переходит клиенту/.test(x.textContent || ""),
    );
    item?.click();
  });
  await ctx.sleep(2000);
  console.log("мастер:", JSON.stringify({ шаг: (await text()).slice(0, 120).split("\n").join(" / ") }));
  await S("b-248-1-wizard-client");

  // клиент
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
  await ctx.sleep(1400);
  // проверка по чёрным спискам
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find(
      (x) => /чёрн|черн/i.test(x.textContent || "") && !/Далее|Назад/.test(x.textContent || ""),
    )?.click();
  });
  await ctx.sleep(400);
  await clickText("Далее");
  await ctx.sleep(1600);
  const t2 = await text();
  console.log("шаг техники:", JSON.stringify({
    заголовок: /Выберите технику/.test(t2),
    строк: (t2.match(/VIN/g) || []).length,
    jog3: /FGHFH/.test(t2),
  }));
  await S("b-248-2-wizard-scooter");
  // ввод VIN «Выкупного» скутера — ничего не находит
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) => /VIN|Модель/.test(i.placeholder || ""));
    if (inp) {
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      s.call(inp, "FGHFH");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await ctx.sleep(1000);
  console.log("после VIN:", JSON.stringify({ пусто: /Ничего не нашли|нет|пуст/i.test(await text()) }));
  await S("b-248-3-wizard-vin-typed");
  // условия — без своего графика
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) => /VIN|Модель/.test(i.placeholder || ""));
    if (inp) {
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      s.call(inp, "");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await ctx.sleep(600);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /км · VIN|VIN /.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(500);
  await clickText("Далее");
  await ctx.sleep(1600);
  console.log("условия:", JSON.stringify({ график: /График платежей/.test(await text()), свой: /Свой/.test(await text()) }));
  await S("b-249-1-wizard-terms");
  await page.keyboard.press("Escape");
  await ctx.sleep(800);

  /* ---- анкета покупателя: Продажи → Заявки → карточка → Оформить ---- */
  await ctx.gotoRoute("sales");
  await ctx.sleep(2500);
  await clickText("Заявки");
  await ctx.sleep(1600);
  await S("b-237-1-sale-applications");
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("button, [role=button], tr, li")].find((x) => /Покупкин/.test(x.textContent || ""));
    row?.click();
  });
  await ctx.sleep(1800);
  const t3 = await text();
  console.log("карточка заявки:", JSON.stringify({
    открыта: /Покупкин/.test(t3),
    кнопки: await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => (b.textContent || "").trim()).filter((x) => x && x.length < 30).slice(0, 14)),
  }));
  await S("b-237-2-application-open");
  const conv = await clickText("Оформить");
  await ctx.sleep(2000);
  console.log("оформить:", conv);
  await S("b-237-3-client-form");
  // сохранить клиента не можем (нужны все поля) — показываем, что дальше идёт форма клиента,
  // а за ней (в старой версии) открывалась НОВАЯ АРЕНДА.
}
