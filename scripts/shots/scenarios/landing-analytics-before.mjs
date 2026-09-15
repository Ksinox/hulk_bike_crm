/**
 * «БЫЛО» для пунктов про аналитику и скрытие прибыли.
 * Снимается со старой сборки: локальный vite + прокси на preview-API.
 */
export async function run(page, ctx) {
  const S = (n, o = {}) => ctx.shot(n, { jpeg: true, ...o });
  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);

  // Закрыть модалку «Свежие правки», если всплыла
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Позже|Закрыть/.test(b.textContent || ""))
      ?.click();
  });
  await ctx.sleep(800);

  /* ---- 1. Рейка раскрыта: где «Аналитика» ---- */
  const aside = await page.$("aside");
  if (aside) await aside.hover();
  await ctx.sleep(1200);
  let info = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("aside button")];
    const a = rows.find((b) => /Аналитика/.test(b.textContent || ""));
    return {
      вРейке: !!a,
      скоро: a ? /скоро/i.test(a.textContent || "") : null,
      disabled: a ? a.disabled === true : null,
    };
  });
  console.log("рейка:", JSON.stringify(info));
  await S("b-an-1-sidebar");

  /* ---- 2. Панель «Ещё» ---- */
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("aside button")].find((b) =>
      /Ещё/.test(b.textContent || ""),
    );
    btn?.focus();
  });
  await ctx.sleep(1200);
  info = await page.evaluate(() => {
    const a = [...document.querySelectorAll("button")].find((b) =>
      /Аналитика/.test(b.textContent || ""),
    );
    return {
      найдена: !!a,
      скоро: a ? /скоро/i.test(a.textContent || "") : null,
      disabled: a ? a.disabled === true : null,
    };
  });
  console.log("ещё:", JSON.stringify(info));
  await S("b-an-2-more");

  /* ---- 3. Клик по «Аналитике» — ничего не открывается ---- */
  await page.evaluate(() => {
    const a = [...document.querySelectorAll("button")].find((b) =>
      /Аналитика/.test(b.textContent || ""),
    );
    a?.click();
  });
  await ctx.sleep(1500);
  console.log("клик:", JSON.stringify({
    остались: (await page.evaluate(() => document.body.innerText)).slice(0, 40).replace(/\s+/g, " "),
  }));
  await S("b-an-3-locked");

  /* ---- 4. Размытая прибыль: читается, при наведении чётче ---- */
  await ctx.gotoRoute("sales");
  await ctx.sleep(3500);
  const blur = await page.evaluate(() => {
    const el = document.querySelector("[aria-label='Скрыто — доступно директору по ключу']");
    return {
      скрытых: document.querySelectorAll("[aria-label='Скрыто — доступно директору по ключу']").length,
      фильтр: el ? getComputedStyle(el).filter : null,
      текст: (el?.textContent || "").trim().slice(0, 20),
    };
  });
  console.log("размытие:", JSON.stringify(blur));
  const box = await page.evaluate(() => {
    const el = document.querySelector("[aria-label='Скрыто — доступно директору по ключу']");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  if (box) {
    await S("b-sn-1-blurred", {
      clip: {
        x: Math.max(0, box.x - 240),
        y: Math.max(0, box.y - 60),
        width: 560,
        height: 150,
      },
    });
    // наведение — размытие слабеет
    await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
    await ctx.sleep(900);
    const hovered = await page.evaluate(() => {
      const el = document.querySelector("[aria-label='Скрыто — доступно директору по ключу']");
      return el ? getComputedStyle(el).filter : null;
    });
    console.log("наведение:", JSON.stringify({ фильтр: hovered }));
    await S("b-sn-2-hover", {
      clip: {
        x: Math.max(0, box.x - 240),
        y: Math.max(0, box.y - 60),
        width: 560,
        height: 150,
      },
    });
  }
}
