/** Партия 2, часть A: п.1 возвраты, п.5 метка, п.7 номера, п.8/9 договор, п.10 график, п.13/14 выкуп. */
export async function run(page, ctx) {
  const text = () => page.evaluate(() => document.body.innerText);
  const click = (label) =>
    page.evaluate((l) => {
      const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === l);
      if (b) b.click();
      return !!b;
    }, label);
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);

  /* ---- п.1 Аренды: плашка «Возвраты» ---- */
  await ctx.gotoRoute("rentals");
  await ctx.sleep(3000);
  let t = await text();
  console.log("п.1 KPI:", JSON.stringify({ плашка: t.includes("Возвраты"), тумблер: /Сегодня\s*Неделя/.test(t.replace(/\n/g, " ")) }));
  await click("Неделя");
  await ctx.sleep(800);
  t = await text();
  const m = t.replace(/\n/g, " ").match(/Возвраты\s+(\d+)/);
  console.log("п.1 неделя:", JSON.stringify({ значение: m?.[1], подпись: t.includes("за 7 дней") }));
  await ctx.shot("v8-rentals-returns", { jpeg: true });
  await page.evaluate(() => {
    [...document.querySelectorAll("[role=button]")].find((x) => /Возвраты/.test(x.textContent || ""))?.click();
  });
  await ctx.sleep(1200);
  t = await text();
  console.log("п.1 фильтр:", JSON.stringify({ строкСписка: (t.match(/#00\d\d/g) || []).length }));

  /* ---- п.5 + п.13 Скутеры → Выкуп ---- */
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);
  await click("Выкуп");
  await ctx.sleep(1500);
  t = await text();
  console.log("п.5/13 Скутеры-Выкуп:", JSON.stringify({
    уКлиентов: /У клиентов/.test(t),
    доступны: /Доступны для выкупа/.test(t),
    метка: (t.match(/был в аренде/gi) || []).length,
    доступен: (t.match(/Доступен для выкупа/g) || []).length,
  }));
  await ctx.shot("v8-fleet-buyout", { jpeg: true });
  await click("Продажа");
  await ctx.sleep(1200);
  t = await text();
  console.log("п.5 Скутеры-Продажа:", JSON.stringify({ метка: (t.match(/был в аренде/gi) || []).length }));
  await ctx.shot("v8-fleet-sale", { jpeg: true });

  /* ---- п.7 карточка техники: выбор номера ---- */
  await click("Аренда");
  await ctx.sleep(1200);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("[role=button]")].find(
      (x) => /Jog|Gear/.test(x.textContent || "") && /ГОТОВ|В АРЕНДЕ/i.test(x.textContent || ""),
    );
    row?.click();
  });
  await ctx.sleep(2000);
  const slotBtn = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.getAttribute("title") || "").startsWith("Сменить номер"));
    if (!b) return null;
    b.click();
    return (b.textContent || "").trim();
  });
  await ctx.sleep(800);
  t = await text();
  console.log("п.7 номера:", JSON.stringify({ кнопка: slotBtn, панель: /Номера в парке/.test(t), обмен: /обмен номерами/.test(t), добавить: /Добавить номера/.test(t) }));
  await ctx.shot("v8-slot-picker", { jpeg: true });
  await page.keyboard.press("Escape");

  /* ---- п.13/14 Выкуп → Доступные + мастер ---- */
  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(2500);
  t = await text();
  console.log("п.13 Выкуп:", JSON.stringify({ вкладка: /Доступные/.test(t), чип: (t.match(/\d+ доступно/) || [])[0] }));
  await click("Доступные");
  await ctx.sleep(1200);
  t = await text();
  console.log("п.13 список:", JSON.stringify({ заголовок: /Доступны для выкупа/.test(t), оформить: (t.match(/Оформить выкуп/g) || []).length, jog: /Jog/.test(t) }));
  await ctx.shot("v8-buyout-stock", { jpeg: true });
  await click("Оформить выкуп");
  await ctx.sleep(1500);
  t = await text();
  console.log("п.14 мастер:", JSON.stringify({ открыт: /Проверка/.test(t) && /Техника/.test(t) }));
  await ctx.shot("v8-buyout-wizard-preset", { jpeg: true });
  await page.keyboard.press("Escape");
  await ctx.sleep(500);

  /* ---- п.10 Продажи: график линия ---- */
  await ctx.gotoRoute("sales");
  await ctx.sleep(2500);
  const hasToggle = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.getAttribute("title") || "") === "Линия");
    if (!b) return false;
    b.click();
    return true;
  });
  await ctx.sleep(1000);
  const svg = await page.evaluate(() => !!document.querySelector("svg path[stroke='#059669']"));
  console.log("п.10 график:", JSON.stringify({ переключатель: hasToggle, линия: svg }));
  await ctx.shot("v8-sales-line", { jpeg: true });
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((x) => (x.getAttribute("title") || "") === "Столбики")?.click();
  });

  /* ---- п.8/9 договор продажи (HTML) ---- */
  const contract = await page.evaluate(async () => {
    const r = await fetch("https://api-preview.104-128-128-96.sslip.io/api/sales/deals/10/document", { credentials: "include" });
    const h = await r.text();
    return {
      status: r.status,
      гарантия: /Гарантийные обязательства/.test(h),
      дни30: /30 \(тридцать\)/.test(h),
      км: /1 000 \(одна тысяча\)/.test(h),
      двигатель: /исключительно на двигатель/.test(h),
      передал: /передал:/.test(h),
      оговорка: /соответствует фактически переданной/.test(h),
      подпись: /подпись Покупателя/.test(h),
      п5: /5\. Заключительные/.test(h),
    };
  });
  console.log("п.8/9 договор:", JSON.stringify(contract));
  await page.goto("https://api-preview.104-128-128-96.sslip.io/api/sales/deals/10/document", { waitUntil: "domcontentloaded" });
  await ctx.sleep(1200);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await ctx.sleep(400);
  await ctx.shot("v8-sale-contract-warranty", { jpeg: true });
  await page.goto("https://crm-preview.104-128-128-96.sslip.io/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(3000);

  /* ---- мобила ---- */
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4000);
  await ctx.gotoRoute("rentals");
  await ctx.sleep(2500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((x) => /Возвраты/.test(x.textContent || ""))?.click();
  });
  await ctx.sleep(1000);
  t = await text();
  console.log("моб п.1:", JSON.stringify({ чипс: /Возвраты/.test(t), тумблер: /Сегодня/.test(t) && /Неделя/.test(t) }));
  await ctx.shot("v8-mobile-returns", { jpeg: true });
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((x) => /Продан|Продажа/.test(x.textContent || ""))?.click();
  });
  await ctx.sleep(1000);
  t = await text();
  console.log("моб п.5:", JSON.stringify({ метка: (t.match(/был в аренде/gi) || []).length }));
  await ctx.shot("v8-mobile-fleet-ex", { jpeg: true });
  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(2500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((x) => (x.getAttribute("title") || "") === "Доступные")?.click();
  });
  await ctx.sleep(1200);
  t = await text();
  console.log("моб п.13:", JSON.stringify({
    список: /Доступны для выкупа/.test(t),
    оформить: (t.match(/Оформить выкуп/g) || []).length,
    overflowX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  }));
  await ctx.shot("v8-mobile-buyout-stock", { jpeg: true });
}
