/** Полный цикл: мастер → договор → подпись → завершение → отчёты. */
const API = "https://api-preview.104-128-128-96.sslip.io";

const click = (page, re, scope) =>
  page.evaluate(
    (re, scope) => {
      const root = scope
        ? [...document.querySelectorAll("div")].find((d) =>
            new RegExp(scope).test(d.innerText || ""),
          ) || document
        : document;
      const b = [...root.querySelectorAll("button")].find((x) =>
        new RegExp(re).test((x.textContent || "").trim()),
      );
      if (b) b.click();
      return !!b;
    },
    re,
    scope,
  );

export async function run(page, ctx) {
  await ctx.gotoRoute("sales");
  await ctx.sleep(2500);
  await click(page, "^В продаже$");
  await ctx.sleep(1500);

  // «Продать» на первой строке
  await page.evaluate(() => {
    [...document.querySelectorAll("tbody button")]
      .find((b) => b.textContent?.trim() === "Продать")?.click();
  });
  await ctx.sleep(1500);

  // Шаг 1 — клиент
  await page.evaluate(() => {
    const list = [...document.querySelectorAll("div.rounded-2xl.border button")];
    list[0]?.click();
  });
  await ctx.sleep(500);
  await click(page, "Далее");
  await ctx.sleep(2200);
  const s2 = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      step: t.match(/Шаг \d из 6/)?.[0],
      selected: !!document.querySelector(".bg-emerald-50"),
    };
  });
  console.log("шаг2:", JSON.stringify(s2));
  await ctx.shot("chk-full-step2", { jpeg: true });

  await click(page, "Далее");
  await ctx.sleep(1800);
  const s3 = await page.evaluate(() => {
    const t = document.body.innerText;
    const price = [...document.querySelectorAll("input")].find(
      (i) => i.placeholder === "0",
    );
    return {
      step: t.match(/Шаг \d из 6/)?.[0],
      price: price?.value,
      profitBlock: /ЗАКУП|Закуп/.test(t),
    };
  });
  console.log("шаг3 (цена):", JSON.stringify(s3));
  await ctx.shot("chk-full-step3", { jpeg: true });

  await click(page, "Далее");
  await ctx.sleep(1800);
  // Шаг 4 — менеджер
  const picked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /% с прибыли/.test(x.innerText || ""),
    );
    b?.click();
    return b?.innerText?.slice(0, 60) ?? null;
  });
  await ctx.sleep(600);
  console.log("шаг4 (менеджер):", JSON.stringify(picked));
  await ctx.shot("chk-full-step4", { jpeg: true });

  await click(page, "Далее");
  await ctx.sleep(2500);
  const s5 = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      step: t.match(/Шаг \d из 6/)?.[0],
      hasContract: /Сформировать договор/.test(t),
      buyer: /Покупатель/.test(t),
    };
  });
  console.log("шаг5 (договор):", JSON.stringify(s5));
  await ctx.shot("chk-full-step5", { jpeg: true });

  // Проверяем сам документ отдельным запросом
  const doc = await page.evaluate(async (API) => {
    const m = document.body.innerText.match(/Сделка #(\d+)/);
    const id = m ? Number(m[1]) : null;
    if (!id) return { id: null };
    const r = await fetch(`${API}/api/sales/deals/${id}/document`, {
      credentials: "include",
    });
    const html = await r.text();
    return {
      id,
      status: r.status,
      isContract: /ДОГОВОР КУПЛИ-ПРОДАЖИ/.test(html),
      hasPrice: /рублей 00 копеек/.test(html),
      hasVin: /Идентификационный номер/.test(html),
      len: html.length,
    };
  }, API);
  console.log("договор:", JSON.stringify(doc));

  await click(page, "Договор сформирован");
  await ctx.sleep(2200);
  const s6 = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      step: t.match(/Шаг \d из 6/)?.[0],
      checklist: /Договор сформирован/.test(t),
      upload: /Приложить фото/.test(t),
    };
  });
  console.log("шаг6 (подпись):", JSON.stringify(s6));
  await ctx.shot("chk-full-step6", { jpeg: true });

  await click(page, "Завершить сделку");
  await ctx.sleep(3000);
  const done = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      wizardClosed: !/Шаг \d из 6/.test(t),
      toast: /оформлена|Продан/.test(t),
    };
  });
  console.log("завершение:", JSON.stringify(done));

  // Обзор — показатели должны ожить
  await click(page, "^Обзор$");
  await ctx.sleep(2500);
  const overview = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      soldLine: t.match(/ПРОДАНО\s*\n?\s*(\d+)/)?.[1],
      revenue: t.match(/ВЫРУЧКА\s*\n?\s*([\d\s тысмлн,]+)/)?.[1]?.trim(),
      hasRating: /Рейтинг менеджеров/.test(t),
      recent: /Последние продажи/.test(t),
    };
  });
  console.log("обзор после продажи:", JSON.stringify(overview));
  await ctx.shot("chk-full-overview", { jpeg: true });

  // Сделки — поиск по VIN
  await click(page, "^Сделки$");
  await ctx.sleep(1800);
  await ctx.shot("chk-full-deals", { jpeg: true });
  const deals = await page.evaluate(() => ({
    rows: document.querySelectorAll("tbody tr").length,
    sold: /Продано/.test(document.body.innerText),
  }));
  console.log("сделки:", JSON.stringify(deals));
}
