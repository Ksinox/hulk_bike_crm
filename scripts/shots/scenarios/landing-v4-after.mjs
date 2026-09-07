/** «СТАЛО» для пункта 2.68: окно плана с единицами, галочки, миниатюра. */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /^Позже$/.test((b.textContent || "").trim()))?.click();
  });
  await ctx.sleep(500);
  await ctx.gotoRoute("analytics");
  await ctx.sleep(3500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Настройка стены/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(2500);

  // Открываем окно плана у «Загрузки парка» настоящим курсором
  const t = await page.evaluate(() => {
    const tile = document.querySelector('[data-tile-index="0"]');
    if (!tile) return null;
    const r = tile.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + 24 };
  });
  if (t) {
    await page.mouse.move(t.x, t.y);
    await ctx.sleep(600);
    const btn = await page.evaluate(() => {
      const b = document.querySelector('[data-tile-index="0"] [title="План"]');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (btn) {
      await page.mouse.move(btn.x, btn.y);
      await ctx.sleep(200);
      await page.mouse.down();
      await page.mouse.up();
      await ctx.sleep(900);
    }
  }
  console.log("окно плана:", JSON.stringify(await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      подсказка: /в процентах, норма загрузки/.test(t),
      единица: /%/.test(t),
      пример: !!document.querySelector('input[placeholder="например, 90"]'),
    };
  })));
  await S("a-v4-plan-input");
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Отменить/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(500);
}
