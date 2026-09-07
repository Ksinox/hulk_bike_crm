/** Мобильный аудит: сделки, аналитика, ремонты — телефон и планшет. */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  const text = () => page.evaluate(() => document.body.innerText);
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  const dismiss = () =>
    page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => /^Позже$/.test((b.textContent || "").trim()))
        ?.click();
    });
  const tapText = (needle) =>
    page.evaluate((n) => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => (x.textContent || "").trim().includes(n) && !x.disabled,
      );
      if (b) b.click();
      return !!b;
    }, needle);

  const phone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const tablet = { width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

  /* ---- 1. Новая сделка на телефоне ---- */
  await page.setViewport(phone);
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await dismiss();
  await ctx.sleep(600);
  await tapText("Сделка");
  await ctx.sleep(1200);
  const deals = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter((b) =>
      /Аренда|Продажа|Выкуп|Ремонт/.test((b.textContent || "").split("\n")[0] || ""),
    );
    return btns.map((b) => ({
      тип: (b.textContent || "").trim().split("\n")[0],
      доступен: !b.disabled,
      скоро: /скоро/i.test(b.textContent || ""),
    }));
  });
  console.log("сделки:", JSON.stringify(deals));
  await S("mb-01-deals");

  // Продажа открывает мастер
  await tapText("Продажа");
  await ctx.sleep(3000);
  console.log("продажа:", JSON.stringify({
    мастер: /Новая продажа|шаг 1/i.test(await text()),
    overflowX: await overflow(),
  }));
  await S("mb-02-sale");

  /* ---- 2. Аналитика на телефоне ---- */
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await dismiss();
  await ctx.gotoRoute("analytics");
  await ctx.sleep(3800);
  let t = await text();
  console.log("аналитика телефон:", JSON.stringify({
    второйМонитор: /На второй монитор/.test(t),
    направления: ["Аренда", "Продажи", "Ремонты", "Выкуп", "Что делать"].filter((x) => t.includes(x)).length,
    overflowX: await overflow(),
  }));
  await S("mb-03-analytics");

  // Настройка стены на телефоне
  await tapText("Настройка стены");
  await ctx.sleep(2500);
  t = await text();
  console.log("настройка телефон:", JSON.stringify({
    миниатюра: await page.evaluate(() => !!document.querySelector('[data-grid]')),
    список: /ширина/i.test(t) && /высота/i.test(t),
    планПоле: await page.evaluate(() => document.querySelectorAll('input[inputmode="numeric"]').length),
    overflowX: await overflow(),
  }));
  await S("mb-04-setup");
  await page.evaluate(() => window.scrollTo(0, 520));
  await ctx.sleep(700);
  await S("mb-04b-setup-list");
  await page.evaluate(() => window.scrollTo(0, 0));

  /* ---- 3. Ремонты на телефоне ---- */
  await ctx.gotoRoute("service");
  await ctx.sleep(3200);
  t = await text();
  console.log("ремонты телефон:", JSON.stringify({
    вкладки: ["Сторонний ремонт", "Наша техника"].filter((x) => t.includes(x)).length,
    кпи: ["РЕМОНТОВ", "ВЫРУЧКА", "ПРИБЫЛЬ"].filter((x) => t.toUpperCase().includes(x)).length,
    overflowX: await overflow(),
  }));
  await S("mb-05-service");

  // Карточка наряда
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /№000/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(2500);
  console.log("наряд телефон:", JSON.stringify({
    открыт: /Ремонт №/.test(await text()),
    overflowX: await overflow(),
  }));
  await S("mb-06-order");

  /* ---- 4. Планшет ---- */
  await page.setViewport(tablet);
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await dismiss();
  await ctx.gotoRoute("service");
  await ctx.sleep(3200);
  console.log("ремонты планшет:", JSON.stringify({
    вкладки: ["Сторонний ремонт", "Наша техника"].filter((x) => (t = "", true)).length,
    текст: /Сторонний ремонт/.test(await text()),
    overflowX: await overflow(),
  }));
  await S("mb-07-tablet-service");

  await ctx.gotoRoute("analytics");
  await ctx.sleep(3800);
  console.log("аналитика планшет:", JSON.stringify({
    второйМонитор: /На второй монитор/.test(await text()),
    overflowX: await overflow(),
    прокрутка: await page.evaluate(
      () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
    ),
  }));
  await S("mb-08-tablet-analytics");
}
