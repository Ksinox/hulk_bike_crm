/** «СТАЛО», часть 3: долг после оплаты 0 ₽, договор выкупа по образцу + правка шаблона, мобила. */
export async function run(page, ctx) {
  const text = () => page.evaluate(() => document.body.innerText);
  const S = (n) => ctx.shot(n, { jpeg: true });
  const click = (needle, exact = false) =>
    page.evaluate(
      ({ needle, exact }) => {
        const b = [...document.querySelectorAll("button")].find((x) => {
          const t = (x.textContent || "").trim();
          return (exact ? t === needle : t.includes(needle)) && !x.disabled;
        });
        if (b) b.click();
        return b ? (b.textContent || "").trim().slice(0, 40) : null;
      },
      { needle, exact },
    );

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);

  /* ---- 2.38: после оплаты долг 0 ---- */
  await ctx.gotoRoute("rentals");
  await ctx.sleep(3000);
  await page.evaluate(() => {
    [...document.querySelectorAll("tr, [role=button]")].find((x) => /Тестов Долг/.test(x.textContent || ""))?.click();
  });
  await ctx.sleep(2200);
  const t38 = await text();
  console.log("после оплаты:", JSON.stringify({
    нетДолгов: /НЕТ ДОЛГОВ|нет долгов/i.test(t38),
    долг: (t38.replace(/\n/g, " ").match(/ДОЛГ\s+[^А-Я]{0,20}/) || [])[0],
  }));
  await S("a-238-3-debt-zero");

  /* ---- 2.46: договор выкупа по образцу ---- */
  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(2500);
  await click("Выкупы", true);
  await ctx.sleep(1500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /#0003/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(2000);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find((d) => /^Документы/.test((d.textContent || "").trim()) && (d.textContent || "").length < 40);
    el?.scrollIntoView({ block: "center" });
  });
  await ctx.sleep(700);
  await S("a-246-1-deal-documents");
  await click("Договор", true);
  await ctx.sleep(4000);
  const doc = await page.evaluate(() => {
    const f = document.querySelector("iframe");
    const d = f?.contentDocument?.body?.innerText || "";
    return {
      модалка: !!f,
      заголовок: /ДОГОВОР АРЕНДЫ ТРАНСПОРТНОГО СРЕДСТВА/i.test(d),
      разделы: (d.match(/^\d\.\s[А-ЯЁ]/gm) || []).length,
      график: /График платежей/.test(d),
      кнопки: [...document.querySelectorAll("button")].map((b) => (b.textContent || "").trim()).filter((x) => /Печать|Word|шаблон/i.test(x)),
    };
  });
  console.log("договор выкупа:", JSON.stringify(doc));
  await S("a-246-2-contract-modal");
  // прокрутить договор к графику и реквизитам
  await page.evaluate(() => {
    const f = document.querySelector("iframe");
    const w = f?.contentWindow;
    if (w) w.scrollTo(0, 1400);
  });
  await ctx.sleep(900);
  await S("a-246-3-contract-schedule");
  // правка шаблона
  const edit = await click("Подправить шаблон");
  await ctx.sleep(3500);
  const ed = await text();
  console.log("редактор:", JSON.stringify({
    кнопка: edit,
    переменные: /Переменные|Арендатор \(клиент\)|Выкуп \(сделка\)/.test(ed),
    заголовок: /Договор аренды с правом выкупа/.test(ed),
  }));
  await S("a-246-4-template-editor");
  await page.keyboard.press("Escape");
  await ctx.sleep(800);

  /* ---- мобила: выручка, возвраты, ревизия, доступные ---- */
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4000);
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(3000);
  await S("a-234-2-mobile-dashboard");
}
