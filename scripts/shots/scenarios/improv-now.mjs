/**
 * «Развитие» 2.95–2.99, СТАЛО (16.09). На превью заранее создана демо-партия
 * «Партия 9 · Gear» (5 шт., две продажи). Проверяет и снимает:
 *   «В продаже» → «Добавить на продажу» (сразу шаг модели) → цена из
 *   последней → предупреждения о рамах → проверка → «Отменить» →
 *   окно снова с черновиком; «Партии» у директора и администратора;
 *   телефон: «Партии» и кнопка в «В продаже».
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
          return r.width > 0 && r.height > 0 && !x.disabled && rx.test((x.textContent || "").trim());
        });
        const el = els.sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.click();
        return el ? (el.textContent || "").trim().slice(0, 40) : null;
      },
      re.source,
      sel,
    );
  const W = "[data-wizard] button";
  const text = () => page.evaluate(() => document.body.innerText.replace(/[  ]/g, " "));
  const clearDraft = () =>
    page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith("hulk-draft:add-scooter")) localStorage.removeItem(k);
    });
  const only = process.env.ONLY ?? "all";

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await clearDraft();
  await page.evaluate(() => localStorage.setItem("hulk-role", "director"));
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);

  if (only === "all" || only === "wizard") {
    await ctx.gotoRoute("sales");
    await ctx.sleep(1500);
    await click(/^В продаже$/);
    await ctx.sleep(1500);
    await ctx.shot("stock-now-d", { jpeg: true });
    console.log("добавить на продажу:", await click(/Добавить на продажу/));
    await ctx.sleep(1000);
    const t1 = await text();
    console.log("  сразу шаг модели:", /Выберите модель|Сколько единиц/.test(t1), "| шаг категории (не должно):", /Куда добавляем технику/.test(t1));
    await ctx.shot("stock-now-wizard", { jpeg: true });

    await click(/^Gear/, W);
    await click(/^2$/, W);
    await page.type('input[placeholder^="Например: Партия"]', "Партия 10 · Gear");
    await click(/^Далее/, W);
    await ctx.sleep(900);
    const price = await page.$eval('input[data-row="-1"][data-col="price"]', (i) => i.value);
    const t2 = await text();
    console.log("  цена подставлена:", price, "| пометка:", /подставлена из\s+последней по Gear/.test(t2));
    await page.type('input[data-row="0"][data-col="vin"]', "UA06J-991901");
    await page.type('input[data-row="1"][data-col="vin"]', "SA36J-991902");
    await page.evaluate(() => document.activeElement?.blur());
    await ctx.sleep(500);
    const t3 = await text();
    console.log("  своя рама без предупреждения:", !/строка 1|UA06J-991901[\s\S]{0,40}Необычная/.test(t3));
    console.log("  чужая рама — предупреждение:", /Необычная рама для Gear: обычно UA06J-…/.test(t3));
    await ctx.shot("vinfmt-now-table", { jpeg: true });
    // длина
    await page.focus('input[data-row="1"][data-col="vin"]');
    await page.keyboard.down("Control");
    await page.keyboard.press("KeyA");
    await page.keyboard.up("Control");
    await page.keyboard.type("UA06J-9919");
    await page.evaluate(() => document.activeElement?.blur());
    await ctx.sleep(400);
    console.log("  короткая рама:", /обычно 12 знаков, здесь 10/.test(await text()));
    const next = await page.evaluate(() => [...document.querySelectorAll("[data-wizard] button")].find((b) => /^Проверить/.test(b.textContent.trim()))?.disabled);
    console.log("  «Проверить» доступна (предупреждение не мешает):", next === false);
    await click(/^Проверить/, W);
    await ctx.sleep(800);
    const t4 = await text();
    console.log("  на проверке:", /Рама не похожа на обычные для Gear\s*—\s*строка 2/.test(t4), "| цена 2 × 110 000:", /2 × 110 000 ₽ = 220 000 ₽/.test(t4));
    await ctx.shot("vinfmt-now-review", { jpeg: true });

    console.log("  добавить:", await click(/^Добавить 2 единицы/, W));
    await ctx.sleep(1800);
    const t5 = await text();
    console.log("  тост с «Отменить»:", /Добавлено: 2 единицы · Gear/.test(t5) && /Отменить/.test(t5), "| «В продаже»:", /Продажи → В продаже/.test(t5));
    await ctx.shot("undo-now-toast", { jpeg: true });
    console.log("  отменить:", await click(/^Отменить$/));
    await ctx.sleep(2500);
    const t6 = await text();
    console.log("  отменено:", /Добавление отменено/.test(t6), "| окно снова открыто:", !!(await page.$("[data-wizard]")), "| черновик:", /Продолжаем черновик/.test(t6));
    const vins = await page.evaluate(() => [...document.querySelectorAll('input[data-col="vin"]')].map((i) => i.value));
    console.log("  рамы в черновике:", vins.join(" | "));
    await ctx.shot("undo-now-reopened", { jpeg: true });
    await page.keyboard.press("Escape");
    await ctx.sleep(500);
    await clearDraft();
  }

  if (only === "all" || only === "batches") {
    await page.evaluate(() => localStorage.setItem("hulk.garageTab", "batches"));
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(5000);
    await ctx.gotoRoute("fleet");
    await ctx.sleep(2000);
    const t = await text();
    console.log("партии:", /Партия 9 · Gear/.test(t));
    console.log("  продано на 223 000:", /Продано на\s*223 000 ₽/.test(t));
    console.log("  на витрине 330 000:", /На витрине на\s*330 000 ₽/.test(t));
    console.log("  закуп 350 000:", /Закуп партии\s*350 000 ₽/.test(t));
    console.log("  прибыль 83 000:", /Прибыль по проданным\s*83 000 ₽/.test(t));
    console.log("  продано 2 из 5:", /Продано 2 из 5/.test(t));
    await click(/^Единицы · 5$/);
    await ctx.sleep(600);
    await ctx.shot("batch-now-d", { jpeg: true });
    // Открыть проданную единицу
    const opened = await page.evaluate(() => {
      const b = [...document.querySelectorAll("li button")].find((x) => /UA06J-991811/.test(x.textContent));
      b?.click();
      return !!b;
    });
    await ctx.sleep(2500);
    const t2 = await text();
    console.log("  карточка единицы открылась:", opened && /UA06J-991811/.test(t2) && /Продажа/.test(t2));
    await ctx.shot("batch-now-open-card", { jpeg: true });

    // Глазами администратора
    await page.evaluate(() => {
      localStorage.setItem("hulk-role", "admin");
      localStorage.setItem("hulk.garageTab", "batches");
    });
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(5000);
    await ctx.gotoRoute("fleet");
    await ctx.sleep(2000);
    const ta = await text();
    console.log("администратор: закуп (не должно):", /Закуп партии/.test(ta), "| прибыль (не должно):", /Прибыль по проданным/.test(ta), "| продано на:", /Продано на\s*223 000 ₽/.test(ta));
    await ctx.shot("batch-now-admin", { jpeg: true });
    await page.evaluate(() => {
      localStorage.setItem("hulk-role", "director");
      localStorage.setItem("hulk.garageTab", "rental");
    });
  }

  if (only === "all" || only === "phone") {
    await page.setUserAgent(PHONE_UA);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(5000);
    await ctx.gotoRoute("fleet");
    await ctx.sleep(1800);
    await ctx.shot("batch-now-m-list", { jpeg: true });
    console.log("телефон, партии:", await click(/^Партии$/));
    await ctx.sleep(1200);
    await click(/^Единицы · 5$/);
    await ctx.sleep(500);
    await ctx.shot("batch-now-m", { jpeg: true });
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log("  переполнение:", ov);
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(4500);
    await ctx.gotoRoute("sales");
    await ctx.sleep(1500);
    await click(/^В продаже$/);
    await ctx.sleep(1500);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /Добавить на продажу/.test(x.textContent));
      b?.scrollIntoView({ block: "center" });
    });
    await ctx.sleep(400);
    await ctx.shot("stock-now-m", { jpeg: true });
    const bw = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /Добавить на продажу/.test(x.textContent));
      const r = b?.getBoundingClientRect();
      return r ? { h: Math.round(r.height), right: Math.round(r.right), vw: innerWidth } : null;
    });
    console.log("  кнопка на телефоне:", JSON.stringify(bw));
  }
  await clearDraft();
}
