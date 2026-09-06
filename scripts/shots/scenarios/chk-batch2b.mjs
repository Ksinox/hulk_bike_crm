/** Партия 2, часть B: п.2 ревизия, п.3 подсказки клиента, п.6 план на период, п.7 номер в дровере. */
export async function run(page, ctx) {
  const text = () => page.evaluate(() => document.body.innerText);
  const click = (label) =>
    page.evaluate((l) => {
      const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === l);
      if (b) b.click();
      return !!b;
    }, label);
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);

  /* ---- п.2 Ревизия парка ---- */
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);
  const revBtn = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Ревизия парка/.test(x.textContent || ""));
    if (!b) return null;
    const n = (b.textContent || "").match(/(\d+)/)?.[1];
    b.click();
    return n;
  });
  await ctx.sleep(2500);
  const rev = await page.evaluate(() => {
    const f = document.querySelector("iframe[srcdoc]");
    const html = f?.getAttribute("srcdoc") || "";
    const doc = new DOMParser().parseFromString(html, "text/html");
    const groups = [...doc.querySelectorAll(".group")].map((g) => ({
      title: g.querySelector(".gtitle")?.textContent,
      count: g.querySelector(".gcount b")?.textContent,
      rows: g.querySelectorAll("tbody tr").length,
      boxes: g.querySelectorAll(".box").length,
    }));
    return { title: doc.querySelector("h1")?.textContent, groups, vin: (html.match(/LC6PAGA/g) || []).length };
  });
  console.log("п.2 ревизия:", JSON.stringify({ кнопка: revBtn, ...rev }));
  await ctx.shot("v8-revision-sheet", { jpeg: true });
  await page.keyboard.press("Escape");
  await ctx.sleep(500);

  /* ---- п.7 номер из дровера ---- */
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("[role=button]")].find((x) => /Jog|Gear/.test(x.textContent || "") && /Готов|В аренде/i.test(x.textContent || ""));
    row?.click();
  });
  await ctx.sleep(2000);
  const slot = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.getAttribute("title") || "").startsWith("Сменить номер"));
    if (!b) return null;
    b.scrollIntoView({ block: "center" });
    b.click();
    return (b.textContent || "").trim();
  });
  await ctx.sleep(800);
  let t = await text();
  console.log("п.7 дровер:", JSON.stringify({ кнопка: slot, панель: /Номера в парке/.test(t), обмен: /обмен номерами/.test(t), добавить: /Добавить номера/.test(t) }));
  await ctx.shot("v8-slot-picker", { jpeg: true });
  await page.keyboard.press("Escape");
  await ctx.sleep(400);

  /* ---- п.6 план продаж ---- */
  await ctx.gotoRoute("sales");
  await ctx.sleep(2500);
  t = await text();
  const planHint = t.replace(/\n/g, " ").match(/План продаж\s+([^\n]{0,40})/)?.[1];
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Задать план|Изменить/.test(x.textContent || "") && x.closest("section, div")?.textContent?.includes("План продаж"));
    if (!b) return false;
    b.click();
    return true;
  });
  await ctx.sleep(1200);
  t = await text();
  console.log("п.6 план:", JSON.stringify({ подпись: planHint, диалог: opened && /Период любой/.test(t), пресеты: ["Этот месяц", "Следующий", "С 15 по 14"].filter((x) => t.includes(x)) }));
  await click("С 15 по 14");
  await ctx.sleep(500);
  await ctx.shot("v8-sales-plan-period", { jpeg: true });
  await page.keyboard.press("Escape");
  await ctx.sleep(400);
  await click("Отмена");
  await ctx.sleep(400);

  /* ---- п.3 «Новый клиент»: дубль по телефону и подсказка ---- */
  await ctx.gotoRoute("partners");
  await ctx.sleep(2500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((x) => /Новый клиент/.test(x.textContent || "") || (x.getAttribute("title") || "").includes("Новый клиент"))?.click();
  });
  await ctx.sleep(1500);
  const fields = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll("input")].map((i) => i.placeholder || i.name || "");
    return inputs.slice(0, 8);
  });
  console.log("п.3 форма:", JSON.stringify(fields));
  // ФИО своё, телефон существующего клиента («Покупалов»)
  await page.evaluate(() => {
    const set = (el, v) => {
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      s.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const inputs = [...document.querySelectorAll("input")];
    const name = inputs.find((i) => /ФИО|Фамилия|Имя/i.test(i.placeholder || ""));
    const phone = inputs.find((i) => /\+7|телефон/i.test(i.placeholder || "") || i.type === "tel");
    if (name) set(name, "Свой Ввод Тестович");
    if (phone) set(phone, "+7 (999) 111-22-33");
  });
  await ctx.sleep(1500);
  t = await text();
  console.log("п.3 подсказка:", JSON.stringify({ hint: (t.match(/Похожая [^\n]{0,60}/) || [])[0], поляОстаются: /останется/.test(t) }));
  await ctx.shot("v8-newclient-hint", { jpeg: true });
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((x) => /Сохранить|Создать клиента|Добавить клиента/.test(x.textContent || "") && !x.disabled)?.click();
  });
  await ctx.sleep(1200);
  t = await text();
  console.log("п.3 дубль:", JSON.stringify({ тост: (t.match(/Клиент с этим номером уже есть[^\n]*\n?[^\n]{0,160}/) || [])[0] }));
  await ctx.shot("v8-newclient-duplicate", { jpeg: true });
  await page.keyboard.press("Escape");
  await ctx.sleep(600);
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => /Закрыть без сохранения|Не сохранять|Выйти/.test(x.textContent || ""))?.click(); });
  await ctx.sleep(600);

  /* ---- мобила: ревизия ---- */
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => (x.getAttribute("aria-label") || "") === "Ревизия парка")?.click(); });
  await ctx.sleep(2500);
  const mrev = await page.evaluate(() => !!document.querySelector("iframe[srcdoc]"));
  console.log("моб п.2:", JSON.stringify({ открыт: mrev }));
  await ctx.shot("v8-mobile-revision", { jpeg: true });
  await page.keyboard.press("Escape");
  await ctx.sleep(500);
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => /Проданы/.test(x.textContent || ""))?.click(); });
  await ctx.sleep(1000);
  t = await text();
  console.log("моб п.5 (Проданы):", JSON.stringify({ метка: (t.match(/был в аренде/gi) || []).length }));
  await ctx.shot("v8-mobile-fleet-ex", { jpeg: true });
}
