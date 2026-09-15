/**
 * Планшетная версия (15.09), часть 2: полноэкранные окна поверх разделов —
 * карточки, мастера оплаты и закрытия, формы «+», выручка. Только открываем и
 * снимаем; ничего не сохраняем (данные превью не трогаем).
 *
 * TABLET_ONLY=portrait|landscape|pro.
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const all = [
    { name: "portrait", width: 820, height: 1180 },
    { name: "landscape", width: 1180, height: 820 },
    { name: "pro", width: 1366, height: 1024 },
  ];
  const vp = all.find((v) => v.name === (process.env.TABLET_ONLY || "landscape"));
  const S = async (n) => {
    const ov = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    console.log(vp.name, n, "overflowX", ov);
    await ctx.shot(`tm2-${vp.name}-${n}`, { jpeg: true });
  };
  const tap = (src, sel = "button") =>
    page.evaluate(
      (src, sel) => {
        const rx = new RegExp(src);
        const els = [...document.querySelectorAll(sel)].filter((x) => {
          const r = x.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && rx.test((x.textContent || "").trim());
        });
        const el = els.sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.click();
        return !!el;
      },
      src.source,
      sel,
    );
  const reset = async () => {
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(5500);
  };

  await page.setUserAgent(IPAD_UA);
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

  // 1. Карточка аренды → «Принять оплату» и «Закрыть аренду»
  await reset();
  await ctx.gotoRoute("rentals");
  await tap(/^Алексей Смирнов/, "div, li, button");
  await ctx.sleep(2200);
  if (await tap(/^Принять оплату$/)) {
    await ctx.sleep(1500);
    await S("01-payment");
  }
  await reset();
  await ctx.gotoRoute("rentals");
  await tap(/^Алексей Смирнов/, "div, li, button");
  await ctx.sleep(2200);
  if (await tap(/^Закрыть аренду$/)) {
    await ctx.sleep(1500);
    await S("02-close");
  }

  // 2. Формы «+»
  await reset();
  await ctx.gotoRoute("clients");
  if (await tap(/Клиент$/)) {
    await ctx.sleep(1500);
    await S("03-new-client");
  }
  await reset();
  await ctx.gotoRoute("rentals");
  if (await tap(/Аренда$/)) {
    await ctx.sleep(1500);
    await S("04-new-rental");
  }
  await reset();
  await ctx.gotoRoute("sales");
  if (await tap(/Продажа$/)) {
    await ctx.sleep(1500);
    await S("05-new-sale");
  }

  // 3. Карточка скутера, выручка, «Все просрочки»
  await reset();
  await ctx.gotoRoute("fleet");
  await ctx.sleep(800);
  const opened = await page.evaluate(() => {
    const row = [...document.querySelectorAll("main button, main li, main [role=button]")].find((x) =>
      /Jog|Gear|U-5/.test(x.textContent || ""),
    );
    row?.click();
    return !!row;
  });
  if (opened) {
    await ctx.sleep(1800);
    await S("06-scooter-card");
  }
  await reset();
  if (await tap(/нажмите для разбивки/, "div, button")) {
    await ctx.sleep(1500);
    await S("07-revenue");
  }
  await reset();
  if (await tap(/^Все/, "button")) {
    await ctx.sleep(1200);
    await S("08-overdue-all");
  }
  // 4. Аналитика → «Настройка стены»
  await reset();
  await ctx.gotoRoute("analytics");
  if (await tap(/Настройка стены/)) {
    await ctx.sleep(1500);
    await S("09-wall-setup");
  }
}
