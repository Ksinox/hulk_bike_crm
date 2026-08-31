/** График: скользящее окно, зум колесом, перетаскивание. */
export async function run(page, ctx) {
  await ctx.gotoRoute("sales");
  await ctx.sleep(2800);

  // Неделя — 7 дней, справа сегодня
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Неделя")?.click();
  });
  await ctx.sleep(1500);
  const week = await page.evaluate(() => {
    const labels = [...document.querySelectorAll("span")]
      .map((s) => (s.textContent || "").trim())
      .filter((t) => /^\d{1,2} [а-я]{3}\.?$/.test(t));
    return {
      labels,
      hint: document.body.innerText.match(/последние \d+ [а-я]+/)?.[0] ?? null,
    };
  });
  console.log("неделя:", JSON.stringify(week));
  await ctx.shot("chk-chart-week", { jpeg: true });

  // Зум колесом над графиком
  const field = await page.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find(
      (d) => d.className && String(d.className).includes("cursor-grab"),
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  console.log("поле графика:", JSON.stringify(field));
  if (field) {
    await page.mouse.move(field.x, field.y);
    await page.mouse.wheel({ deltaY: -200 });
    await ctx.sleep(900);
  }
  const zoomed = await page.evaluate(() => ({
    axis: document.body.innerText.match(/по (часам|дням|неделям|месяцам|годам)/)?.[0],
  }));
  console.log("после приближения:", JSON.stringify(zoomed));
  await ctx.shot("chk-chart-zoom", { jpeg: true });

  // Отдаляем дважды
  if (field) {
    await page.mouse.wheel({ deltaY: 200 });
    await ctx.sleep(600);
    await page.mouse.wheel({ deltaY: 200 });
    await ctx.sleep(900);
  }
  console.log("после отдаления:", await page.evaluate(() => ({
    axis: document.body.innerText.match(/по (часам|дням|неделям|месяцам|годам)/)?.[0],
  })));
  await ctx.shot("chk-chart-zoomout", { jpeg: true });

  // Перетаскивание вправо (в прошлое)
  if (field) {
    await page.mouse.move(field.x, field.y);
    await page.mouse.down();
    await page.mouse.move(field.x + 160, field.y, { steps: 10 });
    await page.mouse.up();
    await ctx.sleep(900);
  }
  console.log("после перетаскивания:", await page.evaluate(() => ({
    label: document.querySelector("section")?.innerText?.slice(0, 80) ?? null,
    range: document.body.innerText.match(/\d{1,2} [а-я]{3} — \d{1,2} [а-я]{3} \d{4}/)?.[0] ?? null,
  })));
  await ctx.shot("chk-chart-pan", { jpeg: true });
}
