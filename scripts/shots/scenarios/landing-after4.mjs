/** «СТАЛО», часть 4: разделы договора продажи отдельными кадрами (гарантия и передача денег). */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  await page.setViewport({ width: 1100, height: 820, deviceScaleFactor: 1.5 });
  await page.goto("https://api-preview.104-128-128-96.sslip.io/api/sales/deals/10/document", {
    waitUntil: "domcontentloaded",
  });
  await ctx.sleep(1500);

  // Раздел «4. Гарантийные обязательства»
  const yWarranty = await page.evaluate(() => {
    const h = [...document.querySelectorAll("h2")].find((x) => /Гарантийные обязательства/.test(x.textContent || ""));
    if (!h) return null;
    const y = h.getBoundingClientRect().top + window.scrollY - 40;
    window.scrollTo(0, y);
    return Math.round(y);
  });
  await ctx.sleep(700);
  console.log("гарантия:", JSON.stringify({ y: yWarranty }));
  await S("a-242-1-contract-warranty");

  // Строка «Денежные средства в сумме … передал» + подпись
  const yMoney = await page.evaluate(() => {
    const el = [...document.querySelectorAll(".money")][0];
    if (!el) return null;
    const y = el.getBoundingClientRect().top + window.scrollY - 260;
    window.scrollTo(0, y);
    return Math.round(y);
  });
  await ctx.sleep(700);
  console.log("передача денег:", JSON.stringify({ y: yMoney }));
  await S("a-243-1-contract-money");

  // Договор выкупа: график платежей внутри документа (для п. 2.46 крупнее)
  await page.goto("https://api-preview.104-128-128-96.sslip.io/api/buyout/deals/3/document", {
    waitUntil: "domcontentloaded",
  });
  await ctx.sleep(1500);
  const ySched = await page.evaluate(() => {
    const t = document.querySelector("table.sched");
    if (!t) return null;
    const y = t.getBoundingClientRect().top + window.scrollY - 120;
    window.scrollTo(0, y);
    return Math.round(y);
  });
  await ctx.sleep(700);
  console.log("график договора:", JSON.stringify({ y: ySched }));
  await S("a-246-3-contract-schedule");

  // Приложение №1 — акт приёма-передачи
  const yAct = await page.evaluate(() => {
    const el = [...document.querySelectorAll("h1")].find((x) => /Акт приёма-передачи/.test(x.textContent || ""));
    if (!el) return null;
    const y = el.getBoundingClientRect().top + window.scrollY - 60;
    window.scrollTo(0, y);
    return Math.round(y);
  });
  await ctx.sleep(700);
  console.log("акт:", JSON.stringify({ y: yAct }));
  await S("a-246-5-contract-act");
}
