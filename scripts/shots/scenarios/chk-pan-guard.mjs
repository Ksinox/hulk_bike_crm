/** График упирается в стенки + кнопка возврата. Точки на «Развитии». */
export async function run(page, ctx) {
  await ctx.gotoRoute("sales");
  await ctx.sleep(2800);

  const field = await page.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find(
      (d) => d.className && String(d.className).includes("cursor-grab"),
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });

  // Тянем далеко в прошлое — должно упереться
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(field.x, field.y);
    await page.mouse.down();
    await page.mouse.move(field.x + 400, field.y, { steps: 12 });
    await page.mouse.up();
    await ctx.sleep(400);
  }
  const after = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      label: t.match(/Динамика продаж\s*\n?([^\n]+)/)?.[1] ?? null,
      hasChart: !!document.querySelector("div.cursor-grab, div.cursor-grabbing"),
      brokenText: /За выбранный период продаж не было/.test(t),
      emptyHint: /За это окно продаж не было/.test(t),
      resetBtn: [...document.querySelectorAll("button")].some((b) =>
        /К сегодняшнему дню/.test(b.textContent || ""),
      ),
    };
  });
  console.log("после протяжки:", JSON.stringify(after));
  await ctx.shot("chk-pan-wall", { jpeg: true });

  // Возврат
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /К сегодняшнему дню/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1200);
  console.log("после возврата:", await page.evaluate(() => ({
    label: document.body.innerText.match(/Динамика продаж\s*\n?([^\n]+)/)?.[1] ?? null,
    resetGone: ![...document.querySelectorAll("button")].some((b) =>
      /К сегодняшнему дню/.test(b.textContent || ""),
    ),
  })));
  await ctx.shot("chk-pan-back", { jpeg: true });

  // Развитие: одна точка, жёлтая
  await page.evaluate(() => localStorage.removeItem("hulk-progress-seen"));
  await ctx.gotoRoute("progress");
  await ctx.sleep(3000);
  console.log("развитие:", await page.evaluate(() => ({
    amber: document.querySelectorAll("span.bg-amber-500").length,
    grey: document.querySelectorAll("span.rounded-full.ring-4").length,
    blueDots: document.querySelectorAll("span.bg-blue-600.rounded-full").length,
  })));
  await ctx.shot("chk-dots", { jpeg: true });
}
