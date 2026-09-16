/**
 * «Развитие» и слайды 2.0.1, БЫЛО (снимать до правок, 16.09): окно
 * «Новый скутер» одной простынёй — категория в самом низу, служебный номер
 * для любой техники; модель в каталоге всегда со ставками аренды.
 * Ничего не сохраняем.
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const click = (re, sel = "button") =>
    page.evaluate(
      (src, sel) => {
        const rx = new RegExp(src);
        const els = [...document.querySelectorAll(sel)].filter((x) => {
          const r = x.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && rx.test((x.textContent || "").trim());
        });
        const el = els.sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.click();
        return el ? (el.textContent || "").trim().slice(0, 30) : null;
      },
      re.source,
      sel,
    );
  const scrollModal = (y) =>
    page.evaluate((y) => {
      const box = [...document.querySelectorAll(".overflow-y-auto")].find((el) =>
        /Добавление/.test(el.closest(".fixed")?.textContent || ""),
      );
      if (box) box.scrollTop = y;
    }, y);

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);
  console.log("добавить:", await click(/Добавить скутер/));
  await ctx.sleep(1500);
  await ctx.shot("addsc-was-1-top", { jpeg: true });
  await scrollModal(2000);
  await ctx.sleep(500);
  await ctx.shot("addsc-was-2-bottom", { jpeg: true });
  console.log("на продажу:", await click(/^На продажу/));
  await ctx.sleep(500);
  await scrollModal(0);
  await ctx.sleep(400);
  await ctx.shot("addsc-was-3-sale-number", { jpeg: true });
  await page.keyboard.press("Escape");
  await ctx.sleep(600);

  console.log("модели:", await click(/^Модели$/));
  await ctx.sleep(2000);
  await ctx.shot("models-was-1-list", { jpeg: true });
  console.log("новая модель:", await click(/Добавить модель|Новая модель/));
  await ctx.sleep(1500);
  await ctx.shot("models-was-2-form", { jpeg: true });
  await page.keyboard.press("Escape");

  await page.setUserAgent(PHONE_UA);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2000);
  console.log("телефон, скутер:", await click(/Скутер$/));
  await ctx.sleep(1500);
  await ctx.shot("addsc-was-m1", { jpeg: true });
}
