/** Сквозной сценарий выкупа: мастер → подписание → платёж. */
const API = "https://api-preview.104-128-128-96.sslip.io";

export async function run(page, ctx) {
  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(2800);
  const start = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      title: /Выкуп/.test(t),
      tabs: ["Обзор", "Выкупы", "Просрочки", "Клиенты"].filter((x) => t.includes(x)),
      overflowX:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log("раздел:", JSON.stringify(start));
  await ctx.shot("v6-buyout-overview", { jpeg: true });

  // Мастер из «Новой сделки»
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Новая сделка/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(700);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Скутер переходит клиенту/.test(b.innerText || ""))?.click();
  });
  await ctx.sleep(2000);
  console.log("шаг 1:", await page.evaluate(() => ({
    step: document.body.innerText.match(/Шаг \d из 6/)?.[0],
    focused: document.activeElement?.getAttribute("placeholder") ?? null,
  })));

  // Клиент
  await page.evaluate(() => {
    [...document.querySelectorAll("div.rounded-2xl.border button")][0]?.click();
  });
  await ctx.sleep(400);
  await page.keyboard.press("Enter");
  await ctx.sleep(1800);

  // Проверка ЧС
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /проверен по чёрным спискам/i.test(b.innerText || ""))?.click();
  });
  await ctx.sleep(400);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Далее/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1800);
  console.log("шаг 3:", await page.evaluate(() => ({
    step: document.body.innerText.match(/Шаг \d из 6/)?.[0],
  })));

  // Техника
  await page.evaluate(() => {
    [...document.querySelectorAll("div.rounded-2xl.border button")][0]?.click();
  });
  await ctx.sleep(500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Далее/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1900);

  // Условия: срок 3 мес, взнос 20000
  const calc0 = await page.evaluate(() => ({
    step: document.body.innerText.match(/Шаг \d из 6/)?.[0],
    total: document.body.innerText.match(/К выплате по договору\s*\n?([\d\s]+)/)?.[1]?.trim(),
  }));
  console.log("шаг условий:", JSON.stringify(calc0));
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /^3 мес/.test((b.innerText || "").trim()))?.click();
  });
  await ctx.sleep(500);
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find(
      (i) => i.placeholder === "0" && i.className.includes("h-11"),
    );
    if (!inp) return;
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(inp), "value",
    ).set;
    setter.call(inp, "20000");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ctx.sleep(800);
  const calc = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      total: t.match(/К выплате по договору\s*([\d\s]+) ₽/)?.[1]?.replace(/\s/g, ""),
      payment: t.match(/Платёж в месяц\s*([\d\s]+) ₽/)?.[1]?.replace(/\s/g, ""),
      line: t.match(/\d+ платеж\w* по [\d\s]+ ₽[^\n]*/)?.[0],
    };
  });
  console.log("калькулятор:", JSON.stringify(calc));
  await ctx.shot("v6-buyout-calc", { jpeg: true });

  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Далее/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1800);

  // AirTag
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Метка установлена/.test(b.innerText || ""))?.click();
  });
  await ctx.sleep(400);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Далее/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(2000);
  const step6 = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      step: t.match(/Шаг \d из 6/)?.[0],
      contract: /Сформировать договор/.test(t),
      sign: /Подписать и начать выкуп/.test(t),
    };
  });
  console.log("шаг договора:", JSON.stringify(step6));
  await ctx.shot("v6-buyout-contract", { jpeg: true });

  // Проверяем документ
  const doc = await page.evaluate(async (API) => {
    const m = document.body.innerText.match(/Выкуп #(\d+)/);
    const id = m ? Number(m[1]) : null;
    if (!id) return { id: null };
    const r = await fetch(`${API}/api/buyout/deals/${id}/document`, {
      credentials: "include",
    });
    const html = await r.text();
    return {
      id,
      status: r.status,
      isContract: /ДОГОВОР АРЕНДЫ ТРАНСПОРТНОГО СРЕДСТВА С ПРАВОМ ВЫКУПА/.test(html),
      hasSchedule: /График платежей/.test(html),
    };
  }, API);
  console.log("договор:", JSON.stringify(doc));

  // Подписание
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Подписать и начать выкуп/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(3000);
  const after = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      wizardClosed: !/Шаг \d из 6/.test(t),
      hasActive: /активных/.test(t),
    };
  });
  console.log("после подписания:", JSON.stringify(after));

  // Открываем сделку и принимаем платёж
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Выкупы")?.click();
  });
  await ctx.sleep(1600);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("button")].find((b) =>
      /#0\d{3}/.test(b.innerText || ""),
    );
    row?.click();
  });
  await ctx.sleep(1800);
  const card = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      open: /Выкуп #/.test(t),
      schedule: /График платежей/.test(t),
      progress: t.match(/Выплачено\s*(\d+)%/)?.[1],
      payBtn: /Принять платёж/.test(t),
    };
  });
  console.log("карточка:", JSON.stringify(card));
  await ctx.shot("v6-buyout-card", { jpeg: true });
}
