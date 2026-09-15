/** Аналитика v3: обзор для человека, настройка стены (канвас), стена — всё в экран. */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  const dismiss = () =>
    page.evaluate(() => {
      [...document.querySelectorAll("button")].find((b) => /^Позже$/.test((b.textContent || "").trim()))?.click();
    });
  const fitInfo = () =>
    page.evaluate(() => {
      const d = document.documentElement;
      const main = document.querySelector("main");
      const r = main?.getBoundingClientRect();
      const titles = [...document.querySelectorAll("main section, [data-tile-index]")]
        .map((el) => el.querySelector("div, span"))
        .filter(Boolean)
        .map((el) => parseFloat(getComputedStyle(el).fontSize));
      // svg-гейджи не должны вылезать из своих плиток
      let clipped = 0;
      for (const svg of document.querySelectorAll("[data-tile-index] svg[role=img], main section svg[role=img]")) {
        const tile = svg.closest("[data-tile-index], section");
        if (!tile) continue;
        const a = svg.getBoundingClientRect();
        const b = tile.getBoundingClientRect();
        if (a.bottom > b.bottom + 1 || a.right > b.right + 1 || a.left < b.left - 1) clipped++;
      }
      return {
        прокруткаОкна: d.scrollHeight - d.clientHeight,
        низMain: r ? Math.round(d.clientHeight - r.bottom) : null,
        минЗаголовок: titles.length ? Math.round(Math.min(...titles)) : null,
        обрезанныхГейджей: clipped,
      };
    });

  /* ---- Обзор на трёх размерах ---- */
  for (const [name, w, h] of [["1440x900", 1440, 900], ["1920x1080", 1920, 1080], ["1280x720", 1280, 720]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(4500);
    await dismiss();
    await ctx.sleep(500);
    await ctx.gotoRoute("analytics");
    await ctx.sleep(4200);
    const t = await page.evaluate(() => document.body.innerText);
    console.log(`обзор ${name}:`, JSON.stringify({
      ...(await fitInfo()),
      направления: ["Аренда", "Продажи", "Ремонты", "Выкуп", "Что делать"].filter((x) => t.includes(x)).length,
      советов: (t.match(/обзвонить|отстаём|опережением|ждут оплату|Всё по плану|Загрузка/g) || []).length,
    }));
    await S(`v3-overview-${name}`);
  }

  /* ---- Настройка стены: канвас ---- */
  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await dismiss();
  await ctx.gotoRoute("analytics");
  await ctx.sleep(3500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Настройка стены/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(2500);
  console.log("настройка:", JSON.stringify({
    ...(await fitInfo()),
    плиток: await page.evaluate(() => document.querySelectorAll("[data-tile-index]").length),
    каталог: await page.evaluate(() => /Добавить показатель/.test(document.body.innerText)),
  }));
  await S("v3-setup");

  // растягиваем маленькую плитку за угол на 2×2
  const target = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll("[data-tile-index]")];
    const small = tiles.find((t) => t.style.gridColumn === "span 1");
    if (!small) return null;
    small.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const hnd = small.querySelector('[title^="Потяните"]');
    if (!hnd) return { noHandle: true };
    const r = hnd.getBoundingClientRect();
    const b = small.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: b.width, h: b.height, idx: small.dataset.tileIndex };
  });
  console.log("уголок:", JSON.stringify(target));
  if (target && !target.noHandle) {
    await page.mouse.move(target.x - 30, target.y - 30);
    await ctx.sleep(300);
    await page.mouse.move(target.x, target.y);
    await ctx.sleep(200);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(target.x + (target.w * 1.1 * i) / 8, target.y + (target.h * 1.1 * i) / 8);
      await ctx.sleep(90);
    }
    await ctx.sleep(300);
    console.log("контур:", JSON.stringify(await page.evaluate(() => {
      const o = [...document.querySelectorAll("div")].find((d) => /×/.test(d.textContent || "") && d.className.includes("border-dashed"));
      return { есть: !!o, подпись: o ? (o.textContent || "").trim().slice(0, 8) : null };
    })));
    await S("v3-resizing");
    await page.mouse.up();
    await ctx.sleep(900);
    console.log("растянули:", JSON.stringify(await page.evaluate((idx) => {
      const t = document.querySelector(`[data-tile-index="${idx}"]`);
      return { column: t?.style.gridColumn, row: t?.style.gridRow };
    }, target.idx)));
    await S("v3-resized");
  }
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Отменить/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(600);

  /* ---- Стена ---- */
  for (const [name, w, h] of [["1920x1080", 1920, 1080], ["1280x720", 1280, 720]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.goto(ctx.base + "/?screen=analytics-wall", { waitUntil: "domcontentloaded" });
    await ctx.sleep(5500);
    console.log(`стена ${name}:`, JSON.stringify(await page.evaluate(() => {
      const d = document.documentElement;
      const tiles = [...document.querySelectorAll("[data-tile-index]")];
      let clipped = 0;
      for (const svg of document.querySelectorAll("[data-tile-index] svg[role=img]")) {
        const a = svg.getBoundingClientRect();
        const b = svg.closest("[data-tile-index]").getBoundingClientRect();
        if (a.bottom > b.bottom + 1 || a.right > b.right + 1) clipped++;
      }
      const titleSizes = tiles.map((t) => parseFloat(getComputedStyle(t.querySelector("div")).fontSize));
      return {
        прокрутка: d.scrollHeight - d.clientHeight,
        плиток: tiles.length,
        обрезанныхГейджей: clipped,
        заголовокМин: Math.round(Math.min(...titleSizes)),
        заголовокМакс: Math.round(Math.max(...titleSizes)),
      };
    })));
    await S(`v3-wall-${name}`);
  }

  /* ---- Мобила ---- */
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await dismiss();
  await ctx.gotoRoute("analytics");
  await ctx.sleep(3500);
  console.log("мобила:", JSON.stringify(await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    направления: ["Аренда", "Продажи", "Ремонты", "Выкуп", "Что делать"].filter((x) => document.body.innerText.includes(x)).length,
  }))));
  await S("v3-mobile");
}
