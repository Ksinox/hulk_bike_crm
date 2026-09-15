/** Сторонние ремонты, продолжение: список, прайс работ, аналитика, мобила. */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  const text = () => page.evaluate(() => document.body.innerText);

  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /^Позже$/.test((b.textContent || "").trim()))?.click();
  });
  await ctx.sleep(700);

  /* ---- список с цифрами за период ---- */
  await ctx.gotoRoute("service");
  await ctx.sleep(3500);
  let t = await text();
  console.log("список:", JSON.stringify({
    строка: /Honda Dio AF62/.test(t),
    статус: /Оплачен/.test(t),
    кпи: (t.match(/РЕМОНТОВ|ВЫРУЧКА|ПРИБЫЛЬ|ЖДЁМ ОПЛАТУ/gi) || []).length,
  }));
  await S("sv-10-list");

  /* ---- вкладка «Наша техника» осталась на месте ---- */
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Наша техника/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(2000);
  t = await text();
  console.log("наша техника:", JSON.stringify({
    вработе: /В работе/.test(t),
    журнал: /Журнал/.test(t),
  }));
  await S("sv-11-own");

  /* ---- прайс работ в документах ---- */
  await ctx.gotoRoute("docs");
  await ctx.sleep(3000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Прейскурант/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(2500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Прайс работ/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(2000);
  t = await text();
  console.log("прайс работ:", JSON.stringify({
    вкладка: /Прайс работ/.test(t),
    группы: ["Двигатель", "Ходовая и трансмиссия", "Электрика"].filter((x) => t.includes(x)),
    подсказка: /сторонний ремонт/i.test(t),
  }));
  await S("sv-12-price-editor");

  /* ---- аналитика ---- */
  await ctx.gotoRoute("analytics");
  await ctx.sleep(4000);
  t = await text();
  console.log("аналитика:", JSON.stringify({
    прочеркУшёл: !/раздел сторонних ремонтов ещё не запущен/.test(t),
    сторонние: /Сторонние ремонты/.test(t),
  }));
  await S("sv-13-analytics");

  /* ---- мобила ---- */
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await ctx.gotoRoute("service");
  await ctx.sleep(3000);
  t = await text();
  console.log("мобила:", JSON.stringify({
    вкладки: ["Сторонний ремонт", "Наша техника"].filter((x) => t.includes(x)),
    ремонт: /Honda Dio AF62/.test(t),
    overflowX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  }));
  await S("sv-14-mobile");
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Honda Dio AF62/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(2500);
  console.log("мобила карточка:", JSON.stringify({
    открылась: /Ремонт №/.test(await text()),
    overflowX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  }));
  await S("sv-15-mobile-card");
}
