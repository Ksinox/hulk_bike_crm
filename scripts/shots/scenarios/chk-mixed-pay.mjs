/** Смешанная оплата в стороннем ремонте: создать наряд, работа из прайса, оплата «смешанно». */
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
        const el = [...document.querySelectorAll("input, textarea")].find((i) =>
          (i.placeholder || "").includes(placeholder),
        );
        if (!el) return false;
        const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
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
  await ctx.sleep(600);
  await ctx.gotoRoute("service");
  await ctx.sleep(3500);

  // новый наряд
  await clickText("Новый ремонт");
  await ctx.sleep(1000);
  await fill("Honda Dio AF62", "Yamaha Jog SA36");
  await fill("Имя", "Олег Кузнецов");
  await fill("Не заводится", "Пропала искра");
  await clickText("Принять в ремонт");
  await ctx.sleep(2500);
  await clickText("Из прайса");
  await ctx.sleep(1200);
  await clickText("Диагностика электрики");
  await ctx.sleep(1500);
  await clickText("Из прайса");
  await ctx.sleep(1000);
  await clickText("Замена реле-регулятора");
  await ctx.sleep(1800);

  // оплата смешанно
  await clickText("Принять оплату");
  await ctx.sleep(1200);
  await clickText("Смешанно");
  await ctx.sleep(800);
  console.log("смешанно:", JSON.stringify(await page.evaluate(() => {
    const t = document.body.innerText;
    return { поля: /Наличными/.test(t) && /Переводом/.test(t), сумма: /1 300/.test(t) };
  })));
  // наличными 500, остальное переводом
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll("input")];
    const cash = inputs.find((i) => /Наличными/i.test(i.closest("label")?.textContent || ""));
    if (!cash) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(cash, "500");
    cash.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ctx.sleep(500);
  await S("mp-01-dialog");
  await clickText("Оплата прошла");
  await ctx.sleep(2500);
  const t = await text();
  console.log("оплачено:", JSON.stringify({
    строка: (t.match(/Оплачено[^\n]*/) || [""])[0],
    статус: /Оплачен/.test(t),
  }));
  await S("mp-02-paid");

  // закрываем карточку и смотрим подпись выручки
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const back = [...document.querySelectorAll("div")].find((d) => d.className.includes("fixed inset-0 z-[60]"));
    back?.click();
  });
  await ctx.sleep(1500);
  console.log("выручка:", JSON.stringify({
    подпись: (await text()).match(/нал [^\n]*перевод [^\n]*/)?.[0] ?? null,
  }));
  await S("mp-03-kpi");
}
