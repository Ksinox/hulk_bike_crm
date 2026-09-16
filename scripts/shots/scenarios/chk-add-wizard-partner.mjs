/**
 * 2.0.1: мастер из «Партнёрки» — только «В аренду»/«Пока не решили»,
 * только электро, без инвестора дальше не пускает. Ничего не сохраняем.
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
        return el ? (el.textContent || "").trim().slice(0, 40) : null;
      },
      re.source,
      sel,
    );
  const text = () => page.evaluate(() => document.body.innerText.replace(/[  ]/g, " "));
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("hulk-draft:add-scooter")) localStorage.removeItem(k);
  });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("partners");
  await ctx.sleep(2000);
  console.log("вкладка техника:", await click(/^Электротранспорт/, "button"));
  await ctx.sleep(800);
  console.log("добавить:", await click(/Добавить технику/, "button"));
  await ctx.sleep(1000);
  const t1 = await text();
  console.log("  категории: аренда", /В аренду/.test(t1), "| продажа (не должно)", /Выставляем на витрину/.test(t1), "| выкуп (не должно)", /Клиент выкупает/.test(t1));
  await ctx.shot("wiz-p1-category", { jpeg: true });
  console.log("далее:", await click(/^Далее/));
  await ctx.sleep(800);
  const models = await page.evaluate(() =>
    [...document.querySelectorAll("[data-wizard] .grid button")].map((b) => b.textContent.trim().slice(0, 12)),
  );
  console.log("  модели:", models.join(" | "));
  console.log("  без инвестора:", /Выберите инвестора/.test(await text()));
  const investor = await click(/Волков|Сергеев/);
  console.log("инвестор:", investor);
  await ctx.sleep(400);
  const next = await page.evaluate(
    () => [...document.querySelectorAll("[data-wizard] button")].find((b) => /^Далее/.test(b.textContent.trim()))?.disabled,
  );
  console.log("  «Далее» заблокирована:", next);
  await ctx.shot("wiz-p2-model-investor", { jpeg: true });
}
