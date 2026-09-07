/**
 * Кадры «БЫЛО» для пунктов про мобильную и планшетную версию (07.09).
 * Снимаются со старой сборки: локальный vite на 5199 + данные preview.
 */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  const dismiss = () =>
    page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => /^Позже$/.test((b.textContent || "").trim()))
        ?.click();
    });
  const tapText = (needle) =>
    page.evaluate((n) => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => (x.textContent || "").trim().includes(n) && !x.disabled,
      );
      if (b) b.click();
      return !!b;
    }, needle);

  const phone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const tablet = { width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

  /* ---- 1. Телефон: меню новой сделки ---- */
  await page.setViewport(phone);
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5500);
  await dismiss();
  await ctx.sleep(600);
  await tapText("Сделка");
  await ctx.sleep(1500);
  console.log("было сделки:", JSON.stringify(await page.evaluate(() => {
    return [...document.querySelectorAll("button")]
      .filter((b) => /Аренда|Продажа|Выкуп|Ремонт/.test((b.textContent || "").split("\n")[0] || ""))
      .map((b) => ({
        тип: (b.textContent || "").trim().split("\n")[0],
        доступен: !b.disabled,
      }));
  })));
  await S("b-mob-deals");

  /* ---- 2. Телефон: аналитика ---- */
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await dismiss();
  await ctx.gotoRoute("analytics");
  await ctx.sleep(4000);
  console.log("было аналитика телефон:", JSON.stringify({
    второйМонитор: /На второй монитор/.test(await page.evaluate(() => document.body.innerText)),
  }));
  await S("b-mob-analytics");

  /* ---- 3. Телефон: настройка стены ---- */
  await tapText("Настройка стены");
  await ctx.sleep(2800);
  await S("b-mob-setup");

  /* ---- 4. Планшет: аналитика ---- */
  await page.setViewport(tablet);
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await dismiss();
  await ctx.gotoRoute("analytics");
  await ctx.sleep(4000);
  console.log("было планшет обрезано:", JSON.stringify(await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("main *")) {
      if (el.children.length > 0) continue;
      const t = (el.textContent || "").trim();
      if (!t) continue;
      if (el.scrollWidth > el.clientWidth + 2) out.push(t.slice(0, 26));
    }
    return out;
  })));
  await S("b-tab-analytics");
}
