/** Сквозной сценарий продажи: данные → мастер → договор → завершение. */
const API = "https://api-preview.104-128-128-96.sslip.io";

export async function run(page, ctx) {
  // 1. Готовим витрину: три единицы в продажу с ценами
  const seed = await page.evaluate(async (API) => {
    const j = async (url, opts) => {
      const r = await fetch(API + url, { credentials: "include", ...opts });
      return { status: r.status, body: await r.json().catch(() => null) };
    };
    // Смена статуса техники защищена ключом директора — берём короткий pass.
    const passRes = await j("/api/approvals/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "2626", action: "scooter_status_change" }),
    });
    const pass = passRes.body?.pass;
    const list = await j("/api/scooters");
    const items = list.body?.items ?? [];
    const cand = items
      .filter((s) => !s.archivedAt && s.baseStatus !== "rental_pool")
      .slice(0, 3);
    const out = [];
    const prices = [
      { p: 78000, s: 119000, b: "Партия 3, апрель 2026" },
      { p: 65000, s: 99000, b: "Партия 3, апрель 2026" },
      { p: 90000, s: 135000, b: "Партия 4, июнь 2026" },
    ];
    for (let i = 0; i < cand.length; i++) {
      const r = await j(`/api/scooters/${cand[i].id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(pass ? { "x-director-approval": `pass:${pass}` } : {}),
        },
        body: JSON.stringify({
          baseStatus: "for_sale",
          purchasePrice: prices[i].p,
          salePrice: prices[i].s,
          purchaseBatch: prices[i].b,
        }),
      });
      out.push({ id: cand[i].id, name: cand[i].name, status: r.status });
    }
    return { total: items.length, pass: !!pass, passStatus: passRes.status, patched: out };
  }, API);
  console.log("seed:", JSON.stringify(seed));

  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  await ctx.gotoRoute("sales");
  await ctx.sleep(2200);

  // 2. Витрина
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "В продаже")?.click();
  });
  await ctx.sleep(1500);
  const stock = await page.evaluate(() => ({
    rows: document.querySelectorAll("tbody tr").length,
    text: /Сумма к продаже/.test(document.body.innerText),
  }));
  console.log("витрина:", JSON.stringify(stock));
  await ctx.shot("chk-flow-stock", { jpeg: true });

  // 3. Мастер: «Продать» на первой строке
  await page.evaluate(() => {
    [...document.querySelectorAll("tbody button")]
      .find((b) => b.textContent?.trim() === "Продать")?.click();
  });
  await ctx.sleep(1500);
  const step1 = await page.evaluate(() => ({
    open: /Новая продажа|Сделка #/.test(document.body.innerText),
    step: /Шаг 1 из 6/.test(document.body.innerText),
    clients: document.querySelectorAll(".fixed button").length,
  }));
  console.log("шаг1:", JSON.stringify(step1));
  await ctx.shot("chk-flow-step1", { jpeg: true });

  // выбираем первого клиента в списке
  await page.evaluate(() => {
    const panel = [...document.querySelectorAll("div")].find((d) =>
      /Шаг 1 из 6/.test(d.innerText || ""),
    );
    const rows = [...document.querySelectorAll("button")].filter((b) =>
      /^\+7|\d{3}/.test(b.innerText || ""),
    );
    // строки клиентов внутри рамки со списком
    const list = [...document.querySelectorAll("div.rounded-2xl.border button")];
    (list[0] ?? rows[0])?.click();
    void panel;
  });
  await ctx.sleep(600);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Далее/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(2000);
  console.log("шаг2:", await page.evaluate(() => document.body.innerText.match(/Шаг \d из 6/)?.[0]));
  await ctx.shot("chk-flow-step2", { jpeg: true });

  // техника уже выбрана (пришли из «Продать») → далее
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Далее/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1800);
  const step3 = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      step: t.match(/Шаг \d из 6/)?.[0],
      hasPrice: /Продажная стоимость/.test(t),
      profit: /Прибыль/.test(t),
    };
  });
  console.log("шаг3:", JSON.stringify(step3));
  await ctx.shot("chk-flow-step3", { jpeg: true });

  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Далее/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1800);
  // шаг 4 — менеджер
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /% с прибыли/.test(b.innerText || ""),
    );
    btn?.click();
  });
  await ctx.sleep(500);
  await ctx.shot("chk-flow-step4", { jpeg: true });
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Далее/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(2000);
  const step5 = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      step: t.match(/Шаг \d из 6/)?.[0],
      contract: /Сформировать договор/.test(t),
      summary: /Покупатель/.test(t),
    };
  });
  console.log("шаг5:", JSON.stringify(step5));
  await ctx.shot("chk-flow-step5", { jpeg: true });
}
