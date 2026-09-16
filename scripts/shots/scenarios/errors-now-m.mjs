/**
 * 2.97/2.98, СТАЛО на телефоне: цена подставлена из последней продажи
 * Gear, рама «не как у Gear» — жёлтое предупреждение. Ничего не сохраняем.
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const click = (re, sel = "[data-wizard] button") =>
    page.evaluate(
      (src, sel) => {
        const rx = new RegExp(src);
        const el = [...document.querySelectorAll(sel)]
          .filter((x) => x.getBoundingClientRect().width > 0 && !x.disabled && rx.test((x.textContent || "").trim()))
          .sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.click();
        return el ? el.textContent.trim().slice(0, 30) : null;
      },
      re.source,
      sel,
    );
  await page.setUserAgent(PHONE_UA);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("hulk-draft:add-scooter")) localStorage.removeItem(k);
  });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(1800);
  console.log("открыть:", await click(/^\+?\s*Скутер$/, "button"));
  await ctx.sleep(900);
  await click(/^На продажу/);
  await ctx.sleep(600);
  console.log("Gear:", await click(/^Gear/));
  await click(/^Далее/);
  await ctx.sleep(900);
  // «Одинаковое для всех» свернуть — ближе карточка единицы
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("[data-wizard] button")].find((x) => /^Одинаковое для всех/.test(x.textContent.trim()));
    b?.click();
  });
  const vin = await page.$('[data-wizard] input[placeholder="SA36J-605232"]');
  await vin?.type("SA36J-991902");
  await page.evaluate(() => document.activeElement?.blur());
  await ctx.sleep(500);
  const t = await page.evaluate(() => document.body.innerText.replace(/[  ]/g, " "));
  console.log("пометка цены:", /подставлена из\s+последней по Gear/.test(t), "| предупреждение:", /Необычная рама для Gear/.test(t));
  await ctx.shot("errors-now-m", { jpeg: true });
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("hulk-draft:add-scooter")) localStorage.removeItem(k);
  });
}
