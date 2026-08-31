/** Хронология продаж, меню сделки, скролл карточки на коротком экране. */
export async function run(page, ctx) {
  // 1. «Новая сделка → Продажа», уже находясь в «Продажах»
  await ctx.gotoRoute("sales");
  await ctx.sleep(2600);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Новая сделка/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(700);
  const order = await page.evaluate(() => {
    const menu = [...document.querySelectorAll("button")]
      .filter((b) => /Аренда|Продажа|Выкуп|Ремонт/.test(b.textContent || ""))
      .map((b) => ({
        label: (b.textContent || "").trim().split("\n")[0],
        disabled: b.disabled,
      }));
    return menu.slice(0, 6);
  });
  console.log("меню:", JSON.stringify(order));
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /^Продажа/.test((b.textContent || "").trim()))?.click();
  });
  await ctx.sleep(2000);
  console.log("мастер из меню:", await page.evaluate(() => ({
    open: /Шаг 1 из 6/.test(document.body.innerText),
  })));
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const x = [...document.querySelectorAll("button")].find(
      (b) => b.querySelector("svg.lucide-x") && /Шаг \d из 6/.test(b.closest("header")?.innerText || ""),
    );
    x?.click();
  });
  await ctx.sleep(900);

  // 2. Хронология «Последних продаж»
  const recent = await page.evaluate(() => {
    const sec = [...document.querySelectorAll("section")].find((x) =>
      /Последние продажи/.test(x.textContent || ""),
    );
    const rows = [...(sec?.querySelectorAll("button") || [])].map((b) =>
      (b.innerText || "").replace(/\n/g, " | ").slice(0, 90),
    );
    return { rows };
  });
  console.log("последние продажи:", JSON.stringify(recent, null, 1));
  await ctx.shot("v5-recent-sales", { jpeg: true });

  // 3. Карточка на коротком экране: скролл и панель
  await page.setViewport({ width: 1440, height: 700, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3200);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2400);
  await page.evaluate(() => {
    [...document.querySelectorAll("button,a")]
      .filter((b) => (b.textContent || "").trim() === "Открыть")[0]?.click();
  });
  await ctx.sleep(2000);
  const card = await page.evaluate(() => {
    const main = [...document.querySelectorAll("main")].find(
      (m) => m.scrollHeight > m.clientHeight + 10,
    );
    const nav = document.querySelector("nav.sticky");
    const header = main?.querySelector("header");
    return {
      scrollable: main ? main.scrollHeight - main.clientHeight : 0,
      navTop: nav ? Math.round(nav.getBoundingClientRect().top) : null,
      headerBottom: header
        ? Math.round(header.getBoundingClientRect().bottom)
        : null,
    };
  });
  console.log("карточка (до скролла):", JSON.stringify(card));

  // Прокручиваем вниз и смотрим, не уехала ли панель под шапку
  await page.evaluate(() => {
    const main = [...document.querySelectorAll("main")].find(
      (m) => m.scrollHeight > m.clientHeight + 10,
    );
    if (main) main.scrollTop = main.scrollHeight / 2;
  });
  await ctx.sleep(800);
  const scrolled = await page.evaluate(() => {
    const main = [...document.querySelectorAll("main")].find(
      (m) => m.scrollHeight > m.clientHeight + 10,
    );
    const nav = document.querySelector("nav.sticky");
    const header = main?.querySelector("header");
    return {
      navTop: nav ? Math.round(nav.getBoundingClientRect().top) : null,
      headerBottom: header
        ? Math.round(header.getBoundingClientRect().bottom)
        : null,
      tab: [...document.querySelectorAll("nav.sticky button")].find((b) =>
        b.className.includes("bg-ink"),
      )?.innerText,
    };
  });
  console.log("карточка (после скролла):", JSON.stringify(scrolled));
  await ctx.shot("chk-card-short", { jpeg: true });
}
