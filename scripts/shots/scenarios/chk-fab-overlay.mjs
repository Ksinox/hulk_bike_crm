/**
 * Телефон и планшет: плавающая кнопка («Сделка», «Аренда», «Скутер»…) не
 * должна оставаться поверх окна, которое она открыла (заказчик 16.09).
 * Нажимаем кнопку в каждом разделе и проверяем, что в её точке — окно.
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

const ROUTES = ["dashboard", "rentals", "clients", "fleet", "sales", "rassrochki"];

export async function run(page, ctx) {
  const probe = async (tag, route) => {
    await ctx.gotoRoute(route);
    await ctx.sleep(1500);
    const fab = await page.evaluate(() => {
      const b = document.querySelector('[data-tour="fab"]');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: b.textContent.trim() };
    });
    if (!fab) {
      console.log(`[${tag}] ${route}: кнопки нет`);
      return;
    }
    await page.evaluate(() => document.querySelector('[data-tour="fab"]').click());
    await ctx.sleep(1200);
    const res = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      const onFab = !!el?.closest('[data-tour="fab"]');
      const fabStill = !!document.querySelector('[data-tour="fab"]');
      // Нижнее меню не должно торчать поверх окна: точка у правого нижнего края.
      const low = document.elementFromPoint(innerWidth - 40, innerHeight - 30);
      const tabBar = [...document.querySelectorAll("nav, footer")].find((n) =>
        /Ещё/.test(n.textContent || "") && n.getBoundingClientRect().bottom >= innerHeight - 2,
      );
      const onTabs = !!(tabBar && low && tabBar.contains(low));
      return { onFab, fabStill, onTabs, what: el ? `${el.tagName}.${String(el.className).slice(0, 50)}` : "—" };
    }, fab);
    const bad = res.onFab || res.onTabs;
    console.log(`[${tag}] ${route} «${fab.label}»: ${res.onFab ? "✘ КНОПКА ПОВЕРХ ОКНА" : "✔ кнопки нет поверх"} · ${res.onTabs ? "✘ МЕНЮ ПОВЕРХ ОКНА" : "✔ меню под окном"}`);
    if (bad) await ctx.shot(`fab-bug-${tag}-${route}`, { jpeg: true });
    // закрыть всё открытое
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Escape");
      await ctx.sleep(200);
    }
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(4000);
  };

  for (const [tag, ua, vp] of [
    ["phone", PHONE_UA, { width: 390, height: 844, deviceScaleFactor: 2 }],
    ["tablet", IPAD_UA, { width: 820, height: 1180, deviceScaleFactor: 1 }],
  ]) {
    await page.setUserAgent(ua);
    await page.setViewport({ ...vp, isMobile: true, hasTouch: true });
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(4500);
    for (const r of ROUTES) await probe(tag, r);
  }
}
