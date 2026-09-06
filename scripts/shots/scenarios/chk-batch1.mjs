/** Партия 1: журнал техники (десктоп+мобила), детализация выплат, выручка без электро. */
export async function run(page, ctx) {
  const text = () => page.evaluate(() => document.body.innerText);

  /* ---------- П.1 десктоп: Скутеры → Журнал ---------- */
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => (b.textContent || "").trim() === "Журнал")
      ?.click();
  });
  await ctx.sleep(2200);
  const t1 = await text();
  console.log("П.1 десктоп:", JSON.stringify({
    вкладка: /Все действия|вся история по технике/.test(t1),
    фильтры: ["Смена статуса", "Рама и двигатель", "Добавление", "Архив и удаление"].filter((x) => t1.includes(x)),
    записей: (t1.match(/Статус |: рама|: VIN|Добавлен|Удалён|удалена|Архив/gi) || []).length,
    неизменяемость: /нельзя|неизменяем|не редактируются/i.test(t1),
  }));
  await ctx.shot("v7-scooter-journal", { jpeg: true });

  /* ---------- П.2: Партнёрка → Инвесторы → Детализация ---------- */
  await ctx.gotoRoute("partners");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Инвесторы")?.click();
  });
  await ctx.sleep(1500);
  const hasDetail = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === "Детализация");
    if (!b) return false;
    b.click();
    return true;
  });
  await ctx.sleep(2000);
  const t2 = await text();
  console.log("П.2:", JSON.stringify({
    кнопка: hasDetail,
    диалог: t2.includes("Выплаты инвесторам"),
    пресеты: ["Этот месяц", "Прошлый месяц", "3 месяца", "Всё время", "Свой период"].filter((x) => t2.includes(x)),
    строки: (t2.match(/наличными|переводом|нал \+/g) || []).length,
  }));
  await ctx.shot("v7-payouts-history", { jpeg: true });
  // «Всё время» — должна появиться история
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === "Всё время")?.click();
  });
  await ctx.sleep(1800);
  const t2b = await text();
  console.log("П.2 всё время:", JSON.stringify({
    строки: (t2b.match(/наличными|переводом|нал \+/g) || []).length,
    итог: (t2b.match(/\d[\d ]* ₽/g) || []).slice(0, 3),
  }));
  await ctx.shot("v7-payouts-history-all", { jpeg: true });
  await page.keyboard.press("Escape");
  await ctx.sleep(500);

  /* ---------- П.3: дашборд — выручка без электро ---------- */
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(3000);
  const t3 = await page.evaluate(() => {
    const card = [...document.querySelectorAll("div")].find((d) => /Выручка/.test(d.textContent || "") && d.className && String(d.className).includes("text-white") && (d.textContent || "").length < 900);
    const txt = card?.innerText ?? "";
    return { электро: /электро|инвестор/i.test(txt), U5: txt.includes("U-5"), head: txt.slice(0, 80).split("\n").join(" / ") };
  });
  console.log("П.3 дашборд:", JSON.stringify(t3));
  await ctx.shot("v7-revenue-clean", { jpeg: true });

  /* ---------- Мобила: П.1 журнал, П.2 диалог ---------- */
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Журнал/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(2200);
  const m1 = await text();
  console.log("П.1 мобила:", JSON.stringify({
    открыт: /Журнал техники/.test(m1) && /Все действия/.test(m1),
    overflowX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  }));
  await ctx.shot("v7-scooter-journal-mobile", { jpeg: true });
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || "").match(/закрыть/i))?.click(); });
  await ctx.sleep(600);

  await ctx.gotoRoute("partners");
  await ctx.sleep(2500);
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Инвесторы")?.click(); });
  await ctx.sleep(1500);
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === "Детализация")?.click(); });
  await ctx.sleep(1800);
  console.log("П.2 мобила:", JSON.stringify({
    диалог: (await text()).includes("Выплаты инвесторам"),
    overflowX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  }));
  await ctx.shot("v7-payouts-history-mobile", { jpeg: true });
}
