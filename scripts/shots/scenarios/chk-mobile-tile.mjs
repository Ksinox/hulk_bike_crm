/** Проверка мобильной плитки скутера после фикса наложения бейджей. */
export async function run(page, ctx) {
  await page.setViewport({ width: 360, height: 800, deviceScaleFactor: 2 });
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2600);
  const overlap = await page.evaluate(() => {
    // ищем пары «бейдж масла» и «пробег» в одной плитке — не пересекаются ли
    const tiles = [...document.querySelectorAll("button")].filter((b) =>
      /км/.test(b.textContent || ""),
    );
    const bad = [];
    for (const t of tiles) {
      const spans = [...t.querySelectorAll("span")];
      const oil = spans.find((s) => /масло/i.test(s.textContent || ""));
      const km = spans.find((s) => /\d\s*км$/.test((s.textContent || "").trim()));
      if (!oil || !km) continue;
      const a = oil.getBoundingClientRect();
      const b = km.getBoundingClientRect();
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapX > 1 && overlapY > 1)
        bad.push({ oil: oil.textContent, km: km.textContent, overlapX });
    }
    return { tiles: tiles.length, bad };
  });
  console.log("наложения:", JSON.stringify(overlap));
  await ctx.shot("chk-mobile-tile", { jpeg: true });
}
