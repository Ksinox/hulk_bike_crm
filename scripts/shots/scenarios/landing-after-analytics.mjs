/** «СТАЛО» для пункта про аналитику: путь по шагам. */
export async function run(page, ctx) {
  const S = (n, o = {}) => ctx.shot(n, { jpeg: true, ...o });
  const dismiss = () =>
    page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => /^Позже$/.test((b.textContent || "").trim()))
        ?.click();
    });

  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await dismiss();
  await ctx.sleep(800);

  /* ---- 1. Сайдбар: раздел открыт ---- */
  const aside = await page.$("aside");
  if (aside) await aside.hover();
  await ctx.sleep(1200);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("aside button")].find((b) =>
      /Ещё/.test(b.textContent || ""),
    );
    btn?.focus();
  });
  await ctx.sleep(1200);
  console.log("сайдбар:", JSON.stringify(await page.evaluate(() => {
    const a = [...document.querySelectorAll("button")].find((b) =>
      /Аналитика/.test(b.textContent || ""),
    );
    return { есть: !!a, скоро: a ? /скоро/i.test(a.textContent || "") : null, disabled: a?.disabled };
  })));
  await S("a-an-1-sidebar");

  // закрываем панель «Ещё», чтобы не висела поверх следующих кадров
  await page.evaluate(() => document.activeElement?.blur());
  await page.mouse.move(900, 500);
  await ctx.sleep(900);

  /* ---- 2. Доска ---- */
  await ctx.gotoRoute("analytics");
  await ctx.sleep(4000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await ctx.sleep(400);
  let t = await page.evaluate(() => document.body.innerText);
  console.log("доска:", JSON.stringify({
    плитки: ["Загрузка парка", "Активные аренды", "Просрочено", "Выручка с аренды", "План и факт"].filter((x) => t.includes(x)),
    планы: (t.match(/план /g) || []).length,
  }).slice(0, 200));
  await S("a-an-2-board");

  /* ---- 3. Низ доски: продажи, выкупы, сводка «План и факт» ---- */
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await ctx.sleep(1200);
  await S("a-an-3-plan-summary");

  /* ---- 4. Конструктор: каталог + кнопки на плитке ---- */
  await page.evaluate(() => window.scrollTo(0, 0));
  await ctx.sleep(500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Настроить/.test(b.textContent || ""))
      ?.click();
  });
  await ctx.sleep(1800);
  // наводим курсор на плитку — показываются ручка перетаскивания и кнопки
  const box = await page.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find(
      (d) => /АКТИВНЫЕ АРЕНДЫ/i.test(d.textContent || "") && (d.textContent || "").length < 120,
    );
    const tile = el?.closest("[draggable]");
    if (!tile) return null;
    const r = tile.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + 20 };
  });
  if (box) await page.mouse.move(box.x, box.y);
  await ctx.sleep(1000);
  t = await page.evaluate(() => document.body.innerText);
  console.log("конструктор:", JSON.stringify({
    каталог: /Добавить показатель/.test(t),
    сохранить: /Сохранить доску/.test(t),
    ручки: await page.evaluate(() => document.querySelectorAll('button[title="Больше"]').length),
  }));
  await S("a-an-4-editing");

  /* ---- 5. Выходим без сохранения ---- */
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Отмена|Готово|Выйти/.test(b.textContent || ""))
      ?.click();
  });
  await ctx.sleep(1200);

  /* ---- 6. Экран на второй монитор ---- */
  await page.goto(ctx.base + "/?screen=analytics-wall", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5500);
  t = await page.evaluate(() => document.body.innerText);
  console.log("стена:", JSON.stringify({
    заголовок: /Как идут дела/.test(t),
    планы: (t.match(/план /g) || []).length,
  }));
  await S("a-an-5-wall");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await ctx.sleep(1000);
  await S("a-an-6-wall-bottom");

  /* ---- 7. Мобильный вид ---- */
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await dismiss();
  await ctx.sleep(600);
  await ctx.gotoRoute("analytics");
  await ctx.sleep(3500);
  t = await page.evaluate(() => document.body.innerText);
  console.log("мобила:", JSON.stringify({
    плитки: ["Загрузка парка", "Активные аренды", "Просрочено"].filter((x) => t.includes(x)),
    overflowX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  }));
  await S("a-an-7-mobile");
}
