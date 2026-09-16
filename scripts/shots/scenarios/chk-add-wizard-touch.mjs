/**
 * Мастер «Новая техника» (2.0.1) на телефоне и планшете: категория «В аренду»,
 * нехватка номеров, карточки/таблица единиц, выбор номера, проверка.
 * Ничего не сохраняем.
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

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
  const overflow = () =>
    page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const bad = [...document.querySelectorAll("[data-wizard] *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > w + 1;
        })
        .slice(0, 3)
        .map((el) => `${el.tagName}.${String(el.className).slice(0, 40)} → ${Math.round(el.getBoundingClientRect().right)}`);
      return bad.length ? bad.join("; ") : "нет";
    });
  const scrollBody = (y) =>
    page.evaluate((y) => {
      const box = [...document.querySelectorAll("[data-wizard] .overflow-y-auto")][0];
      if (box) box.scrollTop = y;
    }, y);

  const flow = async (prefix, vp, ua) => {
    await page.setUserAgent(ua);
    await page.setViewport({ ...vp, isMobile: true, hasTouch: true });
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith("hulk-draft:add-scooter")) localStorage.removeItem(k);
    });
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(5000);
    await ctx.gotoRoute("fleet");
    await ctx.sleep(2000);
    console.log(`[${prefix}] открыть:`, await click(/^\+?\s*Скутер$/, "button"));
    await ctx.sleep(1200);
    await ctx.shot(`${prefix}1-category`, { jpeg: true });
    console.log("  переполнение:", await overflow());

    console.log("  в аренду:", await click(/^В аренду/));
    await ctx.sleep(900);
    console.log("  модель:", await click(/^Jog/));
    console.log("  2 шт.:", await click(/^2$/));
    await ctx.sleep(500);
    await scrollBody(2000);
    await ctx.sleep(300);
    await ctx.shot(`${prefix}2-model-short`, { jpeg: true });
    const t2 = await text();
    console.log("  нехватка номеров:", /Не хватает \d/.test(t2), "| кнопка добавить:", /Добавить \d+ номер/.test(t2));
    console.log("  переполнение:", await overflow());
    console.log("  1 шт.:", await click(/^1$/));
    await ctx.sleep(400);
    await scrollBody(0);
    await ctx.sleep(300);
    await ctx.shot(`${prefix}3-model-ok`, { jpeg: true });

    console.log("  далее:", await click(/^Далее/));
    await ctx.sleep(900);
    console.log("  ещё единица:", await click(/Ещё единица/));
    await ctx.sleep(300);
    const vin = await page.$('[data-wizard] input[placeholder="SA36J-605232"]');
    if (vin) await vin.type("sa36j-700001");
    const mv = await page.$('[data-wizard] input[placeholder="150000"]');
    if (mv) await mv.type("150000");
    await ctx.sleep(400);
    await ctx.shot(`${prefix}4-units`, { jpeg: true });
    console.log("  таблица:", await page.evaluate(() => !!document.querySelector("[data-wizard] table")));
    console.log("  переполнение:", await overflow());
    const t4 = await text();
    console.log("  номеров не хватает у второй:", /номеров не хватает|нет/.test(t4));

    console.log("  номер:", await click(/Арендный номер|^\d+авто$|^нетавто$/));
    await ctx.sleep(600);
    await ctx.shot(`${prefix}5-slot-sheet`, { jpeg: true });
    await page.keyboard.press("Escape");
    await ctx.sleep(300);
    // Убираем вторую единицу, чтобы номера хватило
    const removed = await page.evaluate(() => {
      const b = [...document.querySelectorAll("[data-wizard] button[aria-label]")].filter((x) =>
        /Убрать (единицу|строку) 2/.test(x.getAttribute("aria-label")),
      )[0];
      b?.click();
      return !!b;
    });
    console.log("  убрать вторую:", removed);
    await ctx.sleep(500);
    console.log("  проверить:", await click(/^Проверить/));
    await ctx.sleep(900);
    await ctx.shot(`${prefix}6-review`, { jpeg: true });
    const t6 = await text();
    console.log("  проверка открыта:", /Арендные номера/.test(t6), "| без рамы-предупреждение:", /нет номера рамы/.test(t6));
    console.log("  переполнение:", await overflow());
    await click(/^Назад/);
    await click(/^Назад/);
    await ctx.sleep(300);
  };

  await flow("wiz-m", { width: 390, height: 844, deviceScaleFactor: 2 }, PHONE_UA);
  await flow("wiz-tl", { width: 1180, height: 820, deviceScaleFactor: 1 }, IPAD_UA);
  await flow("wiz-tp", { width: 820, height: 1180, deviceScaleFactor: 1 }, IPAD_UA);
}
