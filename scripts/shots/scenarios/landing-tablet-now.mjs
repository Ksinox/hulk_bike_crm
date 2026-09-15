/**
 * «Развитие» 2.80–2.81, СТАЛО: iPad в Safari открывает планшетную версию,
 * сумма оплаты вводится на своей цифровой клавиатуре. Ничего не подтверждаем.
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
  const state = () =>
    page.evaluate(() => ({
      слой: document.querySelector("aside") ? "компьютерный" : "телефонный",
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
  await page.setUserAgent(IPAD_UA);

  // Портрет
  await page.setViewport({ width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6000);
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(1200);
  console.log("портрет:", JSON.stringify(await state()));
  await ctx.shot("tablet-now-portrait", { jpeg: true });

  // Альбом
  await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6000);
  console.log("альбом:", JSON.stringify(await state()));
  await ctx.shot("tablet-now-dashboard", { jpeg: true });
  await ctx.gotoRoute("rentals");
  await ctx.sleep(1500);
  await ctx.shot("tablet-now-rentals", { jpeg: true });

  // Оплата → шаг «Оплата» → касание по сумме
  console.log("строка:", await tap(/^Алексей Смирнов/, "div, li, button"));
  await ctx.sleep(2500);
  console.log("оплата:", await tap(/^Принять оплату$/));
  await ctx.sleep(1500);
  await tap(/^Далее$/);
  await ctx.sleep(1200);
  await tap(/^Далее$/);
  await ctx.sleep(1200);
  await ctx.shot("tablet-now-payment", { jpeg: true });
  const opened = await page.evaluate(() => {
    const wizard = document.querySelector(".z-\\[100\\]") ?? document;
    const btn = [...wizard.querySelectorAll("button")].find((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && /Принимаем/.test(b.textContent || "") && /₽/.test(b.textContent || "");
    });
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (opened) await page.touchscreen.tap(opened.x, opened.y);
  await ctx.sleep(1000);
  console.log("цифровая клавиатура:", await page.evaluate(() => /Готово/.test(document.body.innerText)));
  await ctx.shot("tablet-now-numpad", { jpeg: true });
}
