/** Правки 31.08: журнал техники, парк целиком, выручка без электро, детализация выплат. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });

  // 1. Журнал техники
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2600);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Журнал",
    );
    b?.click();
  });
  await ctx.sleep(2200);
  const j = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      opened: /Журнал техники/.test(t),
      noDelete: /Записи не удаляются/.test(t),
      filters: ["Смена статуса", "Рама и двигатель", "Добавление", "Архив и удаление", "Замены в арендах"]
        .filter((f) => t.includes(f)).length,
      hasIdentity: /номер двигателя|номер рамы/.test(t),
      hasStatus: /выбыл из парка аренды|вернулся в парк/.test(t),
    };
  });
  console.log("журнал:", JSON.stringify(j));
  await ctx.shot("v4-journal", { jpeg: true });

  // Фильтр «Рама и двигатель»
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Рама и двигатель",
    );
    b?.click();
  });
  await ctx.sleep(1200);
  await ctx.shot("v4-journal-identity", { jpeg: true });

  // 2. Дашборд: парк целиком + выручка без электро
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2600);
  const d = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      parkLabel: (t.match(/из \d+ в парке/g) || []).slice(0, 2),
      noPartnerLine: !/партнёрская .* из .* инвестору/.test(t),
      revenue: (t.match(/ВЫРУЧКА[\s\S]{0,60}/) || [])[0]?.replace(/\n/g, " ") ?? null,
    };
  });
  console.log("дашборд:", JSON.stringify(d));
  await ctx.shot("v4-dashboard", { jpeg: true });

  // 3. Партнёрка: детализация выплат
  await ctx.gotoRoute("partners");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim() === "Инвесторы",
    );
    t?.click();
  });
  await ctx.sleep(1500);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("button")].find((b) =>
      /Волков/.test(b.textContent || ""),
    );
    row?.click();
  });
  await ctx.sleep(1800);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Детализация/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(1500);
  const pay = await page.evaluate(() => ({
    detail: /Период с/.test(document.body.innerText),
    total: /Выплачено за/.test(document.body.innerText),
  }));
  console.log("детализация выплат:", JSON.stringify(pay));
  await ctx.shot("v4-payout-detail", { jpeg: true });
}
