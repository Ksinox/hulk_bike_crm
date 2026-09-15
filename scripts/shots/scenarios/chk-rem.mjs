/** Напоминания на дашборде + плитки + способ расчёта. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  console.log("напоминания API:", await page.evaluate(async () => {
    const base = location.origin.replace("crm-", "api-");
    const r = await fetch(base + "/api/reminders", { credentials: "include" });
    if (!r.ok) return `HTTP ${r.status}`;
    const j = await r.json();
    return { counts: j.counts, first: j.items.slice(0, 3).map((x) => `${x.urgency}|${x.title}|${x.subtitle}`) };
  }));
  console.log("блок на дашборде:", await page.evaluate(() => {
    const t = document.body.innerText;
    const i = t.indexOf("Напоминания");
    return i < 0 ? "НЕТ" : t.slice(i, i + 220).replace(/\n+/g, " / ");
  }));
  await ctx.shot("v6-reminders", { jpeg: true });

  // Плитки выкупа на 1280 — дыр быть не должно
  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(2000);
  console.log("плитки:", await page.evaluate(() => {
    const tiles = [...document.querySelectorAll("div")].filter(
      (d) => d.className && String(d.className).includes("rounded-2xl p-4") &&
        /АКТИВНЫХ|СОБРАНО|ПРОБЛЕМНЫХ|ЗАКРЫТЫХ|ЗАРАБОТОК/i.test(d.innerText || ""),
    );
    const rows = {};
    tiles.forEach((t) => {
      const r = t.getBoundingClientRect();
      const key = Math.round(r.top);
      rows[key] = (rows[key] || 0) + 1;
    });
    const last = Object.keys(rows).map(Number).sort((a, b) => a - b).pop();
    const bottom = tiles.filter((t) => Math.round(t.getBoundingClientRect().top) === last);
    const right = Math.max(...bottom.map((t) => t.getBoundingClientRect().right));
    const container = tiles[0]?.parentElement?.getBoundingClientRect();
    return {
      rows,
      lastRowFillsWidth: container ? Math.abs(right - container.right) < 3 : null,
    };
  }));
  await ctx.shot("v6-buyout-tiles", { jpeg: true });
}
