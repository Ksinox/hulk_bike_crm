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

  /* ---- растягивание за угол ---- */
  const sizesBefore = await page.evaluate(() =>
    [...document.querySelectorAll("[data-tile-index]")].map(
      (t) => Math.round(t.getBoundingClientRect().width),
    ),
  );
  const corner = await page.evaluate(() => {
    const tile = document.querySelector('[data-tile-index="4"]');
    if (!tile) return null;
    tile.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const h = tile.querySelector('[title="Потяните, чтобы растянуть плитку"]');
    if (!h) return null;
    const r = h.getBoundingClientRect();
    const t = tile.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: t.width, h: t.height };
  });
  console.log("уголок:", JSON.stringify({ есть: !!corner }));
  if (corner) {
    await page.mouse.move(corner.x - 40, corner.y - 40);
    await ctx.sleep(400);
    await page.mouse.move(corner.x, corner.y);
    await ctx.sleep(250);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(corner.x + (corner.w * 0.6 * i) / 6, corner.y + (corner.h * 0.6 * i) / 6);
      await ctx.sleep(120);
    }
    await ctx.sleep(400);
    await S("d-06-resizing");
    await page.mouse.up();
    await ctx.sleep(900);
    const sizesAfter = await page.evaluate(() =>
      [...document.querySelectorAll("[data-tile-index]")].map(
        (t) => Math.round(t.getBoundingClientRect().width),
      ),
    );
    console.log("растянули:", JSON.stringify({
      было: sizesBefore[4],
      стало: sizesAfter[4],
      изменилось: sizesBefore[4] !== sizesAfter[4],
    }));
    await S("d-07-resized");
  }

  // выходим без сохранения
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Отменить/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(800);
}
