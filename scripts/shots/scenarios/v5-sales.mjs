/** Кадры для «Развития»: блок продаж + сайдбар. */
export async function run(page, ctx) {
  await ctx.gotoRoute("sales");
  await ctx.sleep(2800);
  await ctx.shot("v5-sales-overview", { jpeg: true });

  // Витрина
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "В продаже")?.click();
  });
  await ctx.sleep(1600);
  await ctx.shot("v5-sales-stock", { jpeg: true });

  // Мастер продажи — шаг «Цена»
  await page.evaluate(() => {
    [...document.querySelectorAll("tbody button")]
      .find((b) => b.textContent?.trim() === "Продать")?.click();
  });
  await ctx.sleep(1500);
  await page.evaluate(() => {
    [...document.querySelectorAll("div.rounded-2xl.border button")][0]?.click();
  });
  await ctx.sleep(500);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => /Далее/.test(b.textContent || ""))?.click();
    });
    await ctx.sleep(1800);
  }
  const step = await page.evaluate(
    () => document.body.innerText.match(/Шаг \d из 6/)?.[0],
  );
  console.log("кадр мастера:", step);
  await ctx.shot("v5-sales-wizard", { jpeg: true });

  // Закрываем мастер и удаляем созданный черновик
  await page.evaluate(() => {
    const x = [...document.querySelectorAll("button")].find(
      (b) =>
        b.querySelector("svg.lucide-x") &&
        /Шаг \d из 6/.test(b.closest("header")?.innerText || ""),
    );
    x?.click();
  });
  await ctx.sleep(1000);
  const cleaned = await page.evaluate(async () => {
    const API = "https://api-preview.104-128-128-96.sslip.io";
    const r = await fetch(`${API}/api/sales/deals`, { credentials: "include" });
    const { items } = await r.json();
    let n = 0;
    for (const d of items) {
      if (d.status === "draft") {
        await fetch(`${API}/api/sales/deals/${d.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        n++;
      }
    }
    return n;
  });
  console.log("удалено черновиков:", cleaned);

  // Карточка сделки
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3200);
  await ctx.gotoRoute("sales");
  await ctx.sleep(2000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Сделки")?.click();
  });
  await ctx.sleep(1500);
  await page.evaluate(() => {
    document.querySelector("tbody tr")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
  });
  await ctx.sleep(1600);
  await ctx.shot("v5-sales-deal", { jpeg: true });

  // Менеджеры
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Менеджеры")?.click();
  });
  await ctx.sleep(1600);
  await ctx.shot("v5-sales-managers", { jpeg: true });

  // Сайдбар раскрытый — порядок разделов, без калькулятора
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2000);
  const pos = await page.evaluate(() => {
    const a = document.querySelector("aside");
    const r = a.getBoundingClientRect();
    return { x: Math.round(r.x + 30), y: Math.round(r.y + 200) };
  });
  await page.mouse.move(pos.x, pos.y, { steps: 6 });
  await ctx.sleep(900);
  const nav = await page.evaluate(() => {
    const a = document.querySelector("aside");
    return {
      width: Math.round(a.getBoundingClientRect().width),
      items: a.innerText.split("\n").filter(Boolean).slice(0, 20),
    };
  });
  console.log("сайдбар:", JSON.stringify(nav));
  await ctx.shot("v5-sidebar", { jpeg: true, clip: { x: 0, y: 0, width: 420, height: 1100 } });

  // Журнал техники — запись о продаже
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Журнал/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(2200);
  const journal = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      hasSold: /Продан/.test(t),
      hasDeal: /сделке #/.test(t),
      sample: (t.match(/Статус[^\n]{0,160}/) || [])[0] ?? null,
    };
  });
  console.log("журнал:", JSON.stringify(journal));
  await ctx.shot("v5-sales-journal", { jpeg: true });
}
