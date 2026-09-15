/**
 * Планшет (15.09): мастер «Принять платёж» → шаг 2 → касание по сумме →
 * выезжает цифровая клавиатура. Ничего не подтверждаем.
 * TABLET_ONLY=portrait|landscape.
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const vp =
    process.env.TABLET_ONLY === "landscape"
      ? { name: "landscape", width: 1180, height: 820 }
      : { name: "portrait", width: 820, height: 1180 };
  const S = (n) => ctx.shot(`tn-${vp.name}-${n}`, { jpeg: true });
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
        return el ? (el.textContent || "").trim().slice(0, 40) : null;
      },
      src.source,
      sel,
    );

  await page.setUserAgent(IPAD_UA);
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5500);
  await ctx.gotoRoute("rentals");
  await tap(/^Алексей Смирнов/, "div, li, button");
  await ctx.sleep(2200);
  await tap(/^Принять оплату$/);
  await ctx.sleep(1500);
  await tap(/^Далее$/);
  await ctx.sleep(1200);
  await tap(/^Далее$/);
  await ctx.sleep(1200);
  await S("01-step3");
  // Кнопки, открывающие цифровую клавиатуру, показывают сумму «… ₽».
  const opened = await page.evaluate(() => {
    const wizard = document.querySelector(".z-\\[100\\]") ?? document;
    const btn = [...wizard.querySelectorAll("button")].find((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && /\d[\d\s]*\s?₽/.test(b.textContent || "") && !/Далее|Принять/.test(b.textContent || "");
    });
    btn?.click();
    return btn ? (btn.textContent || "").trim().slice(0, 60) : null;
  });
  console.log("нажали:", opened);
  await ctx.sleep(1000);
  const pad = await page.evaluate(() => /Готово/.test(document.body.innerText) && !!document.querySelector(".z-\\[150\\]"));
  console.log("цифровая клавиатура открыта:", pad);
  await S("02-numpad");
}
