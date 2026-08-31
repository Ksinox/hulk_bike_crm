/** Меню «Заявки» по наведению + погружение + календарь периода. */
export async function run(page, ctx) {
  await ctx.gotoRoute("sales");
  await ctx.sleep(2800);

  // 1. Переключателя разреза больше нет, календарь общий
  const ov = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      bucketSwitch: /Часы[\s\S]{0,40}Недели/.test(t),
      axisChip: /по дням|по часам|по месяцам/.test(t),
      customBtn: /Свой период/.test(t),
    };
  });
  console.log("обзор:", JSON.stringify(ov));

  // 2. Наведение на «Заявки»
  const pos = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      (x.textContent || "").trim().startsWith("Заявки"),
    );
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  await page.mouse.move(400, 400);
  await ctx.sleep(200);
  if (pos) await page.mouse.move(pos.x, pos.y, { steps: 8 });
  await ctx.sleep(900);
  const menu = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      open: /Открыть список/.test(t),
      channels: ["Скопировать ссылку", "WhatsApp", "Telegram", "МАКС"].filter((c) =>
        t.includes(c),
      ),
    };
  });
  console.log("меню:", JSON.stringify(menu));
  await ctx.shot("v5-apps-menu", { jpeg: true });

  // 3. Погружение + кнопка «Назад»
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Открыть список/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1400);
  const dive = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      title: /Заявки на покупку/.test(t),
      back: [...document.querySelectorAll("button")].some(
        (b) => (b.textContent || "").trim() === "Назад",
      ),
      noCross: ![...document.querySelectorAll("button")].some(
        (b) => b.getAttribute("aria-label") === "Закрыть",
      ),
    };
  });
  console.log("погружение:", JSON.stringify(dive));
  await ctx.shot("v5-apps-dive", { jpeg: true });

  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => (b.textContent || "").trim() === "Назад")?.click();
  });
  await ctx.sleep(900);
  console.log("вернулись:", await page.evaluate(() => ({
    sales: /Динамика продаж/.test(document.body.innerText),
  })));

  // 4. Период «Сегодня» → часы, крайний столбик — текущий час
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Сегодня")?.click();
  });
  await ctx.sleep(1500);
  console.log("сегодня:", await page.evaluate(() => ({
    axis: /по часам/.test(document.body.innerText),
  })));
  await ctx.shot("v5-sales-today", { jpeg: true });
}
