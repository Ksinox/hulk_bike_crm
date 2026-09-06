/** Проверка перетаскивания «как в Notion»: плитка в руке, соседи расступаются. */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /^Позже$/.test((b.textContent || "").trim()))?.click();
  });
  await ctx.sleep(600);
  await ctx.gotoRoute("analytics");
  await ctx.sleep(4000);

  // включаем конструктор
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Настроить/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1500);

  const order = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("[data-flip-key]")].map((e) => e.dataset.flipKey),
    );
  const before = await order();
  console.log("порядок до:", JSON.stringify(before.slice(0, 6)));

  // берём ручку второй плитки
  const grip = await page.evaluate(() => {
    const tile = document.querySelector('[data-tile-index="1"]');
    if (!tile) return null;
    const g = tile.querySelector('[title="Перетащить"]');
    if (!g) return null;
    const r = g.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const target = await page.evaluate(() => {
    const tile = document.querySelector('[data-tile-index="5"]');
    if (!tile) return null;
    const r = tile.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  console.log("координаты:", JSON.stringify({ grip, target }));
  if (!grip || !target) return;

  await page.mouse.move(grip.x, grip.y);
  await ctx.sleep(400);
  await page.mouse.down();
  await ctx.sleep(300);
  // едем к цели несколькими шагами — по дороге снимаем кадр «в руке»
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(
      grip.x + ((target.x - grip.x) * i) / 6,
      grip.y + ((target.y - grip.y) * i) / 6,
    );
    await ctx.sleep(160);
    if (i === 3) {
      console.log("в движении:", JSON.stringify(await page.evaluate(() => ({
        рукаЕсть: !!document.querySelector('.pointer-events-none.fixed[style*="rotate"]'),
        гнездо: [...document.querySelectorAll("div")].filter((d) =>
          /border-dashed/.test(d.className || ""),
        ).length,
      }))));
      await S("d-01-dragging");
    }
  }
  await ctx.sleep(400);
  await S("d-02-before-drop");
  await page.mouse.up();
  await ctx.sleep(900);
  const after = await order();
  console.log("порядок после:", JSON.stringify(after.slice(0, 6)));
  console.log("переставилось:", JSON.stringify({ изменился: before.join() !== after.join() }));
  await S("d-03-dropped");

  // выбор размера схемками: наводим НАСТОЯЩИЙ курсор (панель показывается
  // по :hover, иначе кнопки есть в разметке, но прозрачные)
  const tileBox = await page.evaluate(() => {
    const tile = document.querySelector('[data-tile-index="2"]');
    if (!tile) return null;
    const r = tile.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + 30 };
  });
  if (tileBox) await page.mouse.move(tileBox.x, tileBox.y);
  await ctx.sleep(700);
  const sizeBtn = await page.evaluate(() => {
    const b = document
      .querySelector('[data-tile-index="2"]')
      ?.querySelector('[title="Размер плитки"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (sizeBtn) {
    await page.mouse.move(sizeBtn.x, sizeBtn.y);
    await ctx.sleep(250);
    await page.mouse.down();
    await page.mouse.up();
  }
  await ctx.sleep(900);
  console.log("размеры:", JSON.stringify(await page.evaluate(() => ({
    вариантов: document.querySelectorAll('[title="Маленькая"], [title="Широкая"], [title="Крупная"]').length,
  }))));
  await S("d-04-size-picker");
  const bigBtn = await page.evaluate(() => {
    const b = document.querySelector('[title="Крупная"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (bigBtn) {
    await page.mouse.move(bigBtn.x, bigBtn.y);
    await ctx.sleep(200);
    await page.mouse.down();
    await page.mouse.up();
  }
  await ctx.sleep(1400);
  await S("d-05-size-applied");

  // выходим без сохранения
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Отменить/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(800);
}
