/** Планшет: аналитика (обзор + настройка стены) и ремонты, портрет и альбом. */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  const text = () => page.evaluate(() => document.body.innerText);
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
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

  /** Сколько строк на экране обрезано многоточием (ellipsis). */
  const clipped = () =>
    page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("main *")) {
        if (el.children.length > 0) continue;
        const t = (el.textContent || "").trim();
        if (!t) continue;
        if (el.scrollWidth > el.clientWidth + 2) out.push(t.slice(0, 30));
      }
      return out;
    });

  const portrait = { width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const landscape = { width: 1180, height: 820, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

  /* ---- 1. Планшет-портрет: обзор ---- */
  await page.setViewport(portrait);
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await dismiss();
  await ctx.gotoRoute("analytics");
  await ctx.sleep(3800);
  console.log("портрет обзор:", JSON.stringify({
    второйМонитор: /На второй монитор/.test(await text()),
    overflowX: await overflow(),
    обрезано: await clipped(),
    пустотаСнизу: await page.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) return -1;
      const last = main.getBoundingClientRect().bottom;
      return Math.round(window.innerHeight - Math.min(last, window.innerHeight));
    }),
  }));
  await S("tb-01-overview");
  await page.evaluate(() => window.scrollTo(0, 10000));
  await ctx.sleep(700);
  await S("tb-02-overview-bottom");
  await page.evaluate(() => window.scrollTo(0, 0));

  /* ---- 2. Планшет-портрет: настройка стены ---- */
  await tapText("Настройка стены");
  await ctx.sleep(2500);
  const t2 = await text();
  console.log("портрет настройка:", JSON.stringify({
    миниатюра: await page.evaluate(() => !!document.querySelector("[data-grid]")),
    список: /ширина/i.test(t2) && /высота/i.test(t2),
    overflowX: await overflow(),
  }));
  await S("tb-03-setup");

  /* ---- 3. Планшет-альбом: обзор ---- */
  await page.setViewport(landscape);
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await dismiss();
  await ctx.gotoRoute("analytics");
  await ctx.sleep(3800);
  console.log("альбом обзор:", JSON.stringify({
    overflowX: await overflow(),
    обрезано: await clipped(),
  }));
  await S("tb-04-overview-landscape");

  /* ---- 4. Планшет-альбом: ремонты ---- */
  await ctx.gotoRoute("service");
  await ctx.sleep(3200);
  const t5 = await text();
  console.log("альбом ремонты:", JSON.stringify({
    вкладки: ["Сторонний ремонт", "Наша техника"].filter((x) => t5.includes(x)).length,
    overflowX: await overflow(),
    обрезано: await clipped(),
  }));
  await S("tb-05-service-landscape");
}
