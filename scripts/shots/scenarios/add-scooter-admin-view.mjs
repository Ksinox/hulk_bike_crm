/**
 * 2.92: мастер глазами администратора («Смотрю как: администратор») — ни
 * закупа, ни прибыли, только цена продажи. Ничего не сохраняем.
 */
export async function run(page, ctx) {
  const click = (re, sel = "[data-wizard] button") =>
    page.evaluate(
      (src, sel) => {
        const rx = new RegExp(src);
        const els = [...document.querySelectorAll(sel)].filter((x) => {
          const r = x.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !x.disabled && rx.test((x.textContent || "").trim());
        });
        const el = els.sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.click();
        return el ? (el.textContent || "").trim().slice(0, 30) : null;
      },
      re.source,
      sel,
    );
  const text = () => page.evaluate(() => document.body.innerText.replace(/[  ]/g, " "));
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await page.evaluate(() => {
    localStorage.setItem("hulk-role", "admin");
    localStorage.setItem("hulk.garageTab", "sale");
    for (const k of Object.keys(localStorage)) if (k.startsWith("hulk-draft:add-scooter")) localStorage.removeItem(k);
  });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2000);
  await click(/Добавить скутер/, "button");
  await ctx.sleep(900);
  await click(/^На продажу/);
  await ctx.sleep(600);
  await click(/^Jog/);
  await click(/^2$/);
  await ctx.sleep(300);
  const t2 = await text();
  console.log("шаг 2: закуп есть (не должно):", /Цена закупа/.test(t2));
  await click(/^Далее/);
  await ctx.sleep(800);
  await page.type('input[data-row="-1"][data-col="price"]', "95000");
  await page.type('input[data-row="0"][data-col="vin"]', "SA36J-770001");
  await page.type('input[data-row="1"][data-col="vin"]', "SA36J-770002");
  await page.evaluate(() => document.activeElement?.blur());
  await click(/^Проверить/);
  await ctx.sleep(800);
  const t4 = await text();
  console.log("проверка: «Закуп» (не должно):", /\bЗакуп\b/.test(t4), "| «Прибыль» (не должно):", /Прибыль/.test(t4), "| цена продажи:", /2 × 95 000 ₽ = 190 000 ₽/.test(t4));
  await ctx.shot("addsc-now-5b-review-admin", { jpeg: true });
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    localStorage.setItem("hulk-role", "director");
    for (const k of Object.keys(localStorage)) if (k.startsWith("hulk-draft:add-scooter")) localStorage.removeItem(k);
  });
}
