export async function run(page, ctx) {
  // Чистим тестовые сделки
  const cleaned = await page.evaluate(async () => {
    const API = "https://api-preview.104-128-128-96.sslip.io";
    const r = await fetch(`${API}/api/buyout/deals`, { credentials: "include" });
    const { items } = await r.json();
    let n = 0;
    for (const d of items) {
      if (d.status === "draft" || d.status === "cancelled") {
        await fetch(`${API}/api/buyout/deals/${d.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        n++;
      }
    }
    return { total: items.length, removed: n };
  });
  console.log("чистка:", JSON.stringify(cleaned));

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(2400);
  const mob = await page.evaluate(() => ({
    title: /Выкуп/.test(document.body.innerText),
    overflowX:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  console.log("мобилка:", JSON.stringify(mob));
  await ctx.shot("v6-buyout-mobile", { jpeg: true });

  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Выкупы")?.click();
  });
  await ctx.sleep(1400);
  console.log("список:", await page.evaluate(() => ({
    overflowX:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    rows: (document.body.innerText.match(/#0\d{3}/g) || []).length,
  })));
  await ctx.shot("v6-buyout-mobile-list", { jpeg: true });
}
