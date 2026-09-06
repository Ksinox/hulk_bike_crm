/** Сторонние ремонты: приём, работы из прайса, запчасти, итог, оплата. */
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
  await S("sv-01-section");

  /* ---- 2. Приём техники ---- */
  await clickText("Новый ремонт");
  await ctx.sleep(1200);
  await fill("Honda Dio AF62", "Honda Dio AF62");
  await fill("AF62-1234567", "AF62-9911234");
  await fill("Имя", "Сергей Петров");
  await fill("+7 ...", "+7 928 111-22-33");
  await fill("Не заводится", "Не заводится, стучит вариатор");
  await ctx.sleep(500);
  await S("sv-02-new");
  await clickText("Принять в ремонт");
  await ctx.sleep(2500);
  t = await text();
  console.log("создан:", JSON.stringify({
    карточка: /Ремонт №/.test(t),
    статус: /В работе/.test(t),
    работы: /Работы/.test(t),
    запчасти: /Запчасти/.test(t),
  }));
  await S("sv-03-card");

  /* ---- 3. Работа из прайса ---- */
  await clickText("Из прайса");
  await ctx.sleep(1500);
  t = await text();
  console.log("прайс:", JSON.stringify({
    группы: ["Двигатель", "Ходовая и трансмиссия", "Электрика"].filter((x) => t.includes(x)),
    позиции: (t.match(/Замена вариатора|Чистка карбюратора/g) || []).length,
  }));
  await S("sv-04-price");
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
  await S("sv-05-works");

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
  await fill("₽", "1600");
  await ctx.sleep(400);
  await S("sv-06-part-input");
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
  await S("sv-07-totals");

  /* ---- 5. Готов и оплата ---- */
  await clickText("Готов к выдаче");
  await ctx.sleep(2000);
  await clickText("Принять оплату");
  await ctx.sleep(1300);
  await S("sv-08-pay");
  await clickText("Оплата прошла");
  await ctx.sleep(2500);
  t = await text();
  console.log("оплата:", JSON.stringify({
    оплачен: /Оплачен/.test(t),
    строка: /Оплачено/.test(t),
  }));
  await S("sv-09-paid");

  /* ---- 6. Список и цифры за период ---- */
  await page.evaluate(() => {
    document.querySelectorAll("button")[0];
    const close = [...document.querySelectorAll("button")].find((b) =>
      (b.getAttribute("class") || "").includes("hover:bg-surface-soft"),
    );
    close?.click();
  });
  await page.keyboard.press("Escape");
  await ctx.sleep(500);
  await page.evaluate(() => {
    const back = document.querySelector(".fixed.inset-0.z-\[60\]");
    back?.click();
  });
  await ctx.sleep(1800);
  t = await text();
  console.log("список:", JSON.stringify({
    строка: /Honda Dio AF62/.test(t),
    прибыль: /прибыль/.test(t),
  }));
  await S("sv-10-list");

  /* ---- 7. Аналитика подхватила ---- */
  await ctx.gotoRoute("analytics");
  await ctx.sleep(4000);
  t = await text();
  console.log("аналитика:", JSON.stringify({
    сторонние: /Сторонние ремонты/.test(t),
    прочерк: /раздел сторонних ремонтов ещё не запущен/.test(t),
  }));
  await S("sv-11-analytics");

  /* ---- 8. Мобила ---- */
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await ctx.gotoRoute("service");
  await ctx.sleep(3000);
  console.log("мобила:", JSON.stringify({
    текст: (await text()).slice(0, 120).replace(/s+/g, " "),
    overflowX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  }));
  await S("sv-12-mobile");
}
