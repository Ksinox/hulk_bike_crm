/** Партия 2, добор: п.6 диалог плана, п.3 дубль клиента, п.11 размытая прибыль. */
export async function run(page, ctx) {
  const text = () => page.evaluate(() => document.body.innerText);
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);

  /* ---- п.11 + п.6 Продажи ---- */
  await ctx.gotoRoute("sales");
  await ctx.sleep(2500);
  const blur = await page.evaluate(() => {
    const els = [...document.querySelectorAll("[aria-label='Скрыто — доступно директору по ключу']")];
    return { размытых: els.length, кнопка: !!([...document.querySelectorAll("button")].find((b) => /Прибыль скрыта/.test(b.textContent || ""))), filter: els[0] ? getComputedStyle(els[0]).filter : null };
  });
  console.log("п.11 размытие:", JSON.stringify(blur));
  await ctx.shot("v8-sales-blur", { jpeg: true });
  // клик по размытому → окно «Ключ директора»
  await page.evaluate(() => {
    document.querySelector("[aria-label='Скрыто — доступно директору по ключу']")?.click();
  });
  await ctx.sleep(1200);
  let t = await text();
  console.log("п.11 ключ:", JSON.stringify({ окно: /Ключ директора|Показать прибыль/.test(t) }));
  await ctx.shot("v8-sales-blur-key", { jpeg: true });
  // вводим ключ превью
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) => /ключ/i.test(i.placeholder || "") || i.type === "password");
    if (inp) {
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      s.call(inp, "2626");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await ctx.sleep(300);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Подтвердить|Показать|Ввести|Открыть/.test(b.textContent || "") && !b.disabled)?.click();
  });
  await ctx.sleep(1500);
  const after = await page.evaluate(() => ({
    размытых: document.querySelectorAll("[aria-label='Скрыто — доступно директору по ключу']").length,
    скрыть: !!([...document.querySelectorAll("button")].find((b) => /Скрыть прибыль/.test(b.textContent || ""))),
  }));
  console.log("п.11 после ключа:", JSON.stringify(after));
  await ctx.shot("v8-sales-revealed", { jpeg: true });
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => /Скрыть прибыль/.test(b.textContent || ""))?.click(); });
  await ctx.sleep(500);

  // п.6 диалог плана
  const opened = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter((x) => /Задать план|Изменить/.test((x.textContent || "").trim()));
    const b = btns.find((x) => {
      let el = x;
      for (let i = 0; i < 8 && el; i++) {
        if ((el.textContent || "").includes("План продаж")) return true;
        el = el.parentElement;
      }
      return false;
    });
    if (!b) return false;
    b.click();
    return true;
  });
  await ctx.sleep(1200);
  t = await text();
  console.log("п.6 план:", JSON.stringify({ диалог: opened && /Период любой/.test(t), пресеты: ["Этот месяц", "Следующий", "С 15 по 14"].filter((x) => t.includes(x)) }));
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === "С 15 по 14")?.click(); });
  await ctx.sleep(500);
  await ctx.shot("v8-sales-plan-period", { jpeg: true });
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === "Отмена")?.click(); });
  await ctx.sleep(500);

  /* ---- п.3 «Новый клиент»: дубль по телефону ---- */
  await ctx.gotoRoute("partners");
  await ctx.sleep(2500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((x) => /Новый клиент/.test(x.textContent || "") || (x.getAttribute("title") || "").includes("Новый клиент"))?.click();
  });
  await ctx.sleep(1500);
  await page.evaluate(() => {
    const set = (el, v) => {
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      s.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const inputs = [...document.querySelectorAll("input")];
    const name = inputs.find((i) => /Например: Иванов/.test(i.placeholder || ""));
    const phone = inputs.find((i) => /\+7 \(___\)/.test(i.placeholder || ""));
    if (name) set(name, "Свой Ввод Тестович");
    if (phone) set(phone, "+7 (999) 111-22-33");
  });
  await ctx.sleep(1500);
  t = await text();
  console.log("п.3 подсказка:", JSON.stringify({ hint: (t.match(/Похожая [^\n]{0,70}/) || [])[0] ?? null }));
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Сохранить|Создать|Добавить клиента/.test((x.textContent || "").trim()) && !x.disabled && !/Скрыть|Подтянуть/.test(x.textContent || ""));
    if (!b) return null;
    b.click();
    return (b.textContent || "").trim();
  });
  await ctx.sleep(1200);
  t = await text();
  console.log("п.3 дубль:", JSON.stringify({ кнопка: clicked, тост: (t.match(/Клиент с этим номером уже есть[\s\S]{0,200}/) || [])[0]?.replace(/\n/g, " / ") ?? null }));
  await ctx.shot("v8-newclient-duplicate", { jpeg: true });
}
