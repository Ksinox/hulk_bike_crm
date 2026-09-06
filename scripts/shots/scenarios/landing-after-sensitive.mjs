/** «СТАЛО» для пункта про скрытую прибыль: по шагам. */
export async function run(page, ctx) {
  const S = (n, o = {}) => ctx.shot(n, { jpeg: true, ...o });
  const HID = "[aria-label='Скрыто — доступно директору по ключу']";
  const cropAround = async (name) => {
    const box = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, HID);
    const b = box ?? { x: 900, y: 260, w: 100, h: 40 };
    await S(name, {
      clip: {
        x: Math.max(0, b.x - 240),
        y: Math.max(0, b.y - 60),
        width: 560,
        height: 150,
      },
    });
  };

  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /^Позже$/.test((b.textContent || "").trim()))
      ?.click();
  });
  await ctx.sleep(800);
  await ctx.gotoRoute("sales");
  await ctx.sleep(3500);

  /* ---- 1. Закрыто ---- */
  const hidden = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const inner = el?.querySelector("span");
    return {
      скрытых: document.querySelectorAll(sel).length,
      видимость: inner ? getComputedStyle(inner).visibility : null,
      размытие: el ? getComputedStyle(el).filter : null,
      подПлашкой: (el?.textContent || "").trim().slice(0, 20),
    };
  }, HID);
  console.log("закрыто:", JSON.stringify(hidden));
  await S("a-sn-0-page");
  await cropAround("a-sn-1-hidden");

  /* ---- 2. Клик → окно ключа ---- */
  await page.evaluate((sel) => document.querySelector(sel)?.click(), HID);
  await ctx.sleep(1600);
  console.log("ключ:", JSON.stringify({
    окно: /Ключ директора/.test(await page.evaluate(() => document.body.innerText)),
  }));
  await S("a-sn-2-key");

  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find(
      (i) => /ключ/i.test(i.placeholder || "") || i.type === "password",
    );
    if (!inp) return;
    const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    s.call(inp, "2626");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ctx.sleep(400);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Подтвердить|Показать|Открыть|Проверить/.test(b.textContent || "") && !b.disabled)
      ?.click();
  });
  await ctx.sleep(2200);

  /* ---- 3. Открыто ---- */
  let t = await page.evaluate(() => document.body.innerText);
  console.log("открыто:", JSON.stringify({
    скрытых: await page.evaluate((sel) => document.querySelectorAll(sel).length, HID),
    кнопка: /Скрыть прибыль/.test(t),
    прибыль: /295 000/.test(t),
  }));
  await S("a-sn-3-revealed");
  await page.evaluate(() => {
    const el = document.querySelector("[title='Нажмите, чтобы снова спрятать']");
    el?.scrollIntoView({ block: "center" });
  });
  await ctx.sleep(500);
  const openBox = await page.evaluate(() => {
    const el = document.querySelector("[title='Нажмите, чтобы снова спрятать']");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y };
  });
  if (openBox) {
    await S("a-sn-4-revealed-crop", {
      clip: {
        x: Math.max(0, openBox.x - 240),
        y: Math.max(0, openBox.y - 60),
        width: 560,
        height: 150,
      },
    });
  }

  /* ---- 4. Клик по цифре — спрятали обратно ---- */
  await page.evaluate(() => {
    document.querySelector("[title='Нажмите, чтобы снова спрятать']")?.click();
  });
  await ctx.sleep(1600);
  console.log("спрятали кликом:", JSON.stringify({
    скрытых: await page.evaluate((sel) => document.querySelectorAll(sel).length, HID),
  }));
  await cropAround("a-sn-5-hidden-again");

  /* ---- 5. Показать снова — ключ уже не спрашивает ---- */
  await page.evaluate((sel) => document.querySelector(sel)?.click(), HID);
  await ctx.sleep(1800);
  t = await page.evaluate(() => document.body.innerText);
  console.log("повторно:", JSON.stringify({
    безКлюча: !/Ключ директора/.test(t),
    открыто: await page.evaluate(
      () => document.querySelectorAll("[title='Нажмите, чтобы снова спрятать']").length > 0,
    ),
  }));
  await S("a-sn-6-again");

  /* ---- 6. Мобила: та же плашка и тот же клик ---- */
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Скрыть прибыль/.test(b.textContent || ""))
      ?.click();
  });
  await ctx.sleep(800);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await ctx.gotoRoute("sales");
  await ctx.sleep(3000);
  console.log("мобила:", JSON.stringify({
    скрытых: await page.evaluate((sel) => document.querySelectorAll(sel).length, HID),
    overflowX: await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  }));
  await S("a-sn-7-mobile");
}
