/** Партия 1, мобила: журнал техники (строки), Партнёрка без десктопной шапки, «0 выплат». */
export async function run(page, ctx) {
  const text = () => page.evaluate(() => document.body.innerText);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Журнал/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(2500);
  const m1 = await text();
  const rows = await page.evaluate(() => {
    const els = [...document.querySelectorAll("[data-activity-row], li, div")].filter((d) => /Статус|рама|VIN|Добавлен/i.test(d.textContent || "") && d.getBoundingClientRect().height < 200 && d.getBoundingClientRect().height > 40);
    return els.slice(0, 3).map((d) => ({ w: Math.round(d.getBoundingClientRect().width), right: Math.round(d.getBoundingClientRect().right) }));
  });
  console.log("П.1 мобила:", JSON.stringify({
    открыт: /Журнал техники/.test(m1) && /Все действия/.test(m1),
    overflowX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    rows,
  }));
  await ctx.shot("v7-scooter-journal-mobile", { jpeg: true });
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || "").match(/закрыть/i))?.click(); });
  await ctx.sleep(600);

  await ctx.gotoRoute("partners");
  await ctx.sleep(2500);
  const p0 = await text();
  console.log("Партнёрка мобила:", JSON.stringify({
    десктопШапка: /Смотрю как|Новый клиент|Новая сделка/.test(p0.slice(0, 300)),
    head: p0.slice(0, 120).split("\n").join(" / "),
  }));
  await ctx.shot("v7-partners-mobile", { jpeg: true });
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Инвесторы")?.click(); });
  await ctx.sleep(1500);
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === "Детализация")?.click(); });
  await ctx.sleep(1800);
  const t = await text();
  console.log("П.2 мобила:", JSON.stringify({
    диалог: t.includes("Выплаты инвесторам"),
    счётчик: (t.match(/\d+ выплат[аы]?/g) || []).slice(0, 2),
    overflowX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  }));
  await ctx.shot("v7-payouts-history-mobile", { jpeg: true });
}
