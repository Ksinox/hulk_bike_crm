/**
 * Планшетная версия (15.09): iPad открывает телефонный слой. Обход экранов
 * в обоих поворотах + проверка горизонтальной прокрутки на каждом кадре.
 * Safari на iPad выдаёт себя за Mac — эмулируем именно его.
 *
 * TABLET_ONLY=portrait|landscape|pro — один поворот (быстрее).
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const all = [
    { name: "portrait", width: 820, height: 1180 },
    { name: "landscape", width: 1180, height: 820 },
    { name: "pro", width: 1366, height: 1024 },
  ];
  const only = process.env.TABLET_ONLY;
  const vps = only ? all.filter((v) => v.name === only) : all.slice(0, 2);

  const info = () =>
    page.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      wide: [...document.querySelectorAll("body *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > innerWidth + 2 && getComputedStyle(el).position !== "fixed";
        })
        .slice(0, 3)
        .map((el) => el.tagName + "." + String(el.className).slice(0, 50)),
      слой: document.querySelector("aside") ? "компьютерный" : "телефонный",
    }));
  const tapText = (re, sel = "button, [role=button], a, li, div") =>
    page.evaluate(
      (src, sel) => {
        const rx = new RegExp(src);
        const els = [...document.querySelectorAll(sel)].filter((x) => {
          const r = x.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && rx.test((x.textContent || "").trim());
        });
        // самый глубокий элемент с этим текстом
        const el = els.sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.click();
        return !!el;
      },
      re.source,
      sel,
    );
  const back = () =>
    page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        /Назад|Закрыть/.test(x.getAttribute("aria-label") || x.textContent || ""),
      );
      b?.click();
      return !!b;
    });

  for (const vp of vps) {
    const S = async (n) => {
      console.log(vp.name, n, JSON.stringify(await info()));
      await ctx.shot(`tm-${vp.name}-${n}`, { jpeg: true });
    };
    await page.setUserAgent(IPAD_UA);
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(6000);
    await S("01-dashboard");

    await ctx.gotoRoute("rentals");
    await S("02-rentals");
    if (await tapText(/^Алексей Смирнов/)) {
      await ctx.sleep(2200);
      await S("03-rental-card");
      await back();
      await ctx.sleep(1200);
    }

    await ctx.gotoRoute("clients");
    await S("04-clients");
    if (await tapText(/^Иван Иванов/)) {
      await ctx.sleep(2200);
      await S("05-client-card");
      await back();
      await ctx.sleep(1200);
    }

    await ctx.gotoRoute("fleet");
    await S("06-scooters");

    for (const [route, n] of [
      ["applications", "07-applications"],
      ["debtors", "08-debtors"],
      ["service", "09-service"],
      ["analytics", "10-analytics"],
      ["sales", "11-sales"],
      ["rassrochki", "12-buyout"],
      ["staff", "13-staff"],
      ["settings", "14-settings"],
    ]) {
      await ctx.gotoRoute(route);
      await ctx.sleep(1200);
      await S(n);
    }

    await ctx.gotoRoute("dashboard");
    await ctx.sleep(1000);
    if (await tapText(/^Ещё$/, "button")) {
      await ctx.sleep(900);
      await S("15-more-sheet");
      await page.keyboard.press("Escape");
      await page.mouse.click(vp.width / 2, 40);
      await ctx.sleep(600);
    }
    if (await tapText(/Сделка$/, "button")) {
      await ctx.sleep(900);
      await S("16-deal-sheet");
    }
  }
}
