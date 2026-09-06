/** «СТАЛО», часть 2: анкета покупателя → мастер продажи, долг гасится, договор выкупа по образцу. */
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

  /* ============ 2.37: анкета покупателя → клиент → мастер ПРОДАЖИ ============ */
  await ctx.gotoRoute("sales");
  await ctx.sleep(2500);
  await click("Заявки");
  await ctx.sleep(1800);
  await S("a-237-1-sale-applications");
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll("*")].filter((x) => /Покупкин/.test(x.textContent || "") && (x.textContent || "").length < 200);
    const row = rows[rows.length - 1];
    let el = row;
    for (let i = 0; i < 6 && el; i++) {
      if (el.tagName === "BUTTON" || el.getAttribute?.("role") === "button") { el.click(); return; }
      el = el.parentElement;
    }
    row?.click();
  });
  await ctx.sleep(2000);
  await S("a-237-2-application-card");
  const accepted = await click("Принять", true);
  await ctx.sleep(2500);
  let t = await text();
  console.log("после «Принять»:", JSON.stringify({
    кнопка: accepted,
    формаКлиента: /Новый клиент/.test(t),
    заполнено: (t.match(/\d+ \/ 10 обязательных/) || [])[0],
  }));
  await S("a-237-3-client-form");
  const saved = await click("Сохранить и открыть карточку");
  await ctx.sleep(3500);
  t = await text();
  console.log("после сохранения:", JSON.stringify({
    кнопка: saved,
    мастерПродажи: /Новая продажа|Продажа скутера|Клиент.*Техника.*Цена/s.test(t),
    шапка: t.slice(0, 140).split("\n").join(" / "),
  }));
  await S("a-237-4-sales-wizard");
  await page.keyboard.press("Escape");
  await ctx.sleep(800);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Закрыть без сохранения|Не сохранять|Выйти|Да, закрыть/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(800);

  /* ============ 2.38: долг гасится ============ */
  await ctx.gotoRoute("rentals");
  await ctx.sleep(3000);
  await page.evaluate(() => {
    [...document.querySelectorAll("tr, [role=button]")].find((x) => /Тестов Долг/.test(x.textContent || ""))?.click();
  });
  await ctx.sleep(2000);
  await S("a-238-1-rental-debt");
  await click("Принять оплату");
  await ctx.sleep(2000);
  t = await text();
  console.log("диалог оплаты:", JSON.stringify({
    открыт: /Оплата|Принять оплату|Просрочка/i.test(t),
    суммы: (t.match(/[\d ]+ ₽/g) || []).slice(0, 6),
  }));
  await S("a-238-2-payment-dialog");
}
