/** «СТАЛО» для лендинга: путь стороннего ремонта по шагам. */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  const text = () => page.evaluate(() => document.body.innerText);
  const clickText = (needle) =>
    page.evaluate((n) => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => (x.textContent || "").trim().includes(n) && !x.disabled,
      );
      if (b) b.click();
      return !!b;
    }, needle);
  const fill = (placeholder, value) =>
    page.evaluate(
      ({ placeholder, value }) => {
        const el = [...document.querySelectorAll("input, textarea")].find(
          (i) => (i.placeholder || "").includes(placeholder),
        );
        if (!el) return false;
        const proto =
          el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      },
      { placeholder, value },
    );

  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /^Позже$/.test((b.textContent || "").trim()))?.click();
  });
  await ctx.sleep(700);

  /* ---- 1. Раздел «Ремонты», главная вкладка ---- */
  await ctx.gotoRoute("service");
  await ctx.sleep(3500);
  let t = await text();
  console.log("раздел:", JSON.stringify({
    вкладки: ["Сторонний ремонт", "Наша техника"].filter((x) => t.includes(x)),
    цифры: ["Ремонтов", "Выручка", "Прибыль", "Ждём оплату"].filter((x) => t.includes(x)),
    кнопка: /Новый ремонт/.test(t),
  }));
  await S("a-sv-1-section");

  /* ---- 2. Приём техники ---- */
  await clickText("Новый ремонт");
  await ctx.sleep(1200);
  await fill("Honda Dio AF62", "Honda Dio AF62");
  await fill("AF62-1234567", "AF62-9911234");
  await fill("Имя", "Сергей Петров");
  await fill("+7 ...", "+7 928 111-22-33");
  await fill("Не заводится", "Не заводится, стучит вариатор");
  await ctx.sleep(500);
  await S("a-sv-2-new");
  await clickText("Принять в ремонт");
  await ctx.sleep(2500);
  t = await text();
  console.log("создан:", JSON.stringify({
    карточка: /Ремонт №/.test(t),
    статус: /В работе/.test(t),
    работы: /Работы/.test(t),
    запчасти: /Запчасти/.test(t),
  }));
  await S("a-sv-3-card");

  /* ---- 3. Работа из прайса ---- */
  await clickText("Из прайса");
  await ctx.sleep(1500);
  t = await text();
  console.log("прайс:", JSON.stringify({
    группы: ["Двигатель", "Ходовая и трансмиссия", "Электрика"].filter((x) => t.includes(x)),
    позиции: (t.match(/Замена вариатора|Чистка карбюратора/g) || []).length,
  }));
  await S("a-sv-4-price");
  await clickText("Замена вариатора");
  await ctx.sleep(1800);
  await clickText("Из прайса");
  await ctx.sleep(1200);
  await clickText("Чистка карбюратора");
  await ctx.sleep(1800);
  t = await text();
  console.log("работы добавлены:", JSON.stringify({
    вариатор: /Замена вариатора/.test(t),
    карбюратор: /Чистка карбюратора/.test(t),
  }));
  await S("a-sv-5-works");

  /* ---- 4. Запчасть с закупом ---- */
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("input")].find((i) =>
      (i.placeholder || "").includes("Запчасть"),
    );
    if (!el) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
      el,
      "Ремень вариатора Bando",
    );
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await fill("закуп", "900");
  await page.evaluate(() => {
    // цена клиенту именно в строке запчасти (полей «₽» на экране два)
    const rows = [...document.querySelectorAll("div")].filter((d) =>
      (d.className || "").includes("border-dashed"),
    );
    const row = rows.find((d) =>
      [...d.querySelectorAll("input")].some((i) => (i.placeholder || "").includes("закуп")),
    );
    const el = [...(row?.querySelectorAll("input") ?? [])].find(
      (i) => (i.placeholder || "") === "₽",
    );
    if (!el) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "1600");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ctx.sleep(400);
  await S("a-sv-6-part");
  // кнопка «+» в строке запчасти
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("div")].find(
      (d) =>
        d.className.includes("border-dashed") &&
        [...d.querySelectorAll("input")].some((i) => (i.placeholder || "").includes("закуп")),
    );
    row?.querySelector("button")?.click();
  });
  await ctx.sleep(2000);
  t = await text();
  const totals = await page.evaluate(() => {
    const t = document.body.innerText;
    const grab = (label) => {
      const m = new RegExp(label + "\s*\n?\s*([−\-]?\s?[\d\s]+₽)").exec(t);
      return m ? m[1].replace(/\s+/g, " ").trim() : null;
    };
    return {
      выручка: grab("Выручка"),
      себестоимость: grab("Себестоимость запчастей"),
      прибыль: grab("Прибыль"),
    };
  });
  console.log("итог:", JSON.stringify(totals));
  await S("a-sv-7-totals");

  /* ---- 5. Готов и оплата ---- */
  await clickText("Готов к выдаче");
  await ctx.sleep(2000);
  await clickText("Принять оплату");
  await ctx.sleep(1300);
  await S("a-sv-8-pay");
  await clickText("Оплата прошла");
  await ctx.sleep(2500);
  t = await text();
  console.log("оплата:", JSON.stringify({
    оплачен: /Оплачен/.test(t),
    строка: /Оплачено/.test(t),
  }));
  await S("a-sv-9-paid");

}
