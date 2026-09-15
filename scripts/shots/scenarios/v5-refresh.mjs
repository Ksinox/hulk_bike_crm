/** Обновление кадров лендинга после правок 31.08. */
export async function run(page, ctx) {
  // Обзор продаж (новая компоновка + график)
  await ctx.gotoRoute("sales");
  await ctx.sleep(3000);
  await ctx.shot("v5-sales-overview", { jpeg: true });

  // Мастер: шаг «Клиент» с кнопкой анкеты покупателя
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Новая продажа/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1800);
  await ctx.shot("v5-sales-client", { jpeg: true });
  await page.evaluate(() => {
    const x = [...document.querySelectorAll("button")].find(
      (b) => b.querySelector("svg.lucide-x") && /Шаг \d из 6/.test(b.closest("header")?.innerText || ""),
    );
    x?.click();
  });
  await ctx.sleep(900);
  // подчистим созданный черновик
  await page.evaluate(async () => {
    const API = "https://api-preview.104-128-128-96.sslip.io";
    const r = await fetch(`${API}/api/sales/deals`, { credentials: "include" });
    const { items } = await r.json();
    for (const d of items) {
      if (d.status === "draft") {
        await fetch(`${API}/api/sales/deals/${d.id}`, {
          method: "DELETE",
          credentials: "include",
        });
      }
    }
  });

  // Сайдбар без «Заявок»
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2000);
  const pos = await page.evaluate(() => {
    const a = document.querySelector("aside");
    const r = a.getBoundingClientRect();
    return { x: Math.round(r.x + 30), y: Math.round(r.y + 200) };
  });
  await page.mouse.move(pos.x, pos.y, { steps: 6 });
  await ctx.sleep(900);
  await ctx.shot("v5-sidebar", {
    jpeg: true,
    clip: { x: 0, y: 0, width: 420, height: 1100 },
  });
  await page.mouse.move(900, 500, { steps: 6 });
  await ctx.sleep(600);

  // Карточка техники: боковая панель + обложка
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2600);
  await page.evaluate(() => {
    [...document.querySelectorAll("button,a")]
      .filter((b) => (b.textContent || "").trim() === "Открыть")[0]?.click();
  });
  await ctx.sleep(2000);
  await ctx.shot("v5-card-drawer", { jpeg: true });
  console.log("карточка:", await page.evaluate(() => ({
    rail: !!document.querySelector("nav.sticky"),
    vinOnce: (document.body.innerText.match(/VIN \/ НОМЕР РАМЫ/gi) || []).length,
  })));
}
