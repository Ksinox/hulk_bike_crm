/**
 * «Развитие» 2.80–2.81, БЫЛО (снимать со сборки ДО планшетной версии):
 * iPad в Safari открывал компьютерную версию; сумма оплаты вводилась в
 * маленькое поле, своей цифровой клавиатуры не было.
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
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
  await page.setUserAgent(IPAD_UA);
  await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6000);
  console.log("слой:", await page.evaluate(() => (document.querySelector("aside") ? "компьютерный" : "телефонный")));
  await ctx.shot("tablet-was-dashboard", { jpeg: true });

  await ctx.gotoRoute("rentals");
  await ctx.sleep(1500);
  await ctx.shot("tablet-was-rentals", { jpeg: true });
  console.log("строка:", await tap(/^Алексей Смирнов/, "tr, div, li, button"));
  await ctx.sleep(2500);
  console.log("оплата:", await tap(/^Принять оплату$/));
  await ctx.sleep(2000);
  await ctx.shot("tablet-was-payment", { jpeg: true });
  // Шаг с суммой: маленькое поле, своей цифровой клавиатуры нет.
  console.log("продолжить:", await tap(/^Продолжить/));
  await ctx.sleep(2000);
  const inp = await page.evaluate(() => {
    const el = [...document.querySelectorAll("input")].find((i) => {
      const r = i.getBoundingClientRect();
      return r.width > 0 && r.left > innerWidth / 2 && /\d/.test(i.value || i.placeholder || "");
    });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, v: el.value, w: Math.round(r.width), h: Math.round(r.height) };
  });
  console.log("поле суммы:", JSON.stringify(inp));
  if (inp) {
    await page.touchscreen.tap(inp.x, inp.y);
    await ctx.sleep(800);
  }
  await ctx.shot("tablet-was-payment-amount", { jpeg: true });
}
