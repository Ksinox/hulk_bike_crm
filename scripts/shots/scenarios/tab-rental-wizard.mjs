/**
 * Планшет: мастер «Новая аренда» по шагам (22.10) — кадры каждого шага.
 * Ничего не создаёт: доходит до последнего шага и закрывается.
 *   VP=land|port PREFIX=tabrent node scripts/shots/shot.mjs scripts/shots/scenarios/tab-rental-wizard.mjs
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const vp = process.env.VP ?? "land";
  const prefix = process.env.PREFIX ?? "tabrent";
  await page.setUserAgent(IPAD_UA);
  await page.setViewport(
    vp === "port"
      ? { width: 820, height: 1180, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
      : { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  );
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
  });
  const click = (src, scope) =>
    page.evaluate(
      (src, scope) => {
        const r = new RegExp(src);
        const root = scope ? document.querySelector(scope) ?? document : document;
        const el = [...root.querySelectorAll("button")]
          .filter((x) => {
            const b = x.getBoundingClientRect();
            return b.width > 0 && b.height > 0 && !x.disabled && r.test((x.textContent || "").trim());
          })
          .sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.click();
        return el ? (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) : null;
      },
      src,
      scope,
    );
  await ctx.gotoRoute("rentals");
  await ctx.sleep(2000);
  console.log("открыли:", await click("^Аренда$"));
  await ctx.sleep(1500);
  await ctx.shot(`${prefix}-1-${vp}`, { jpeg: true });
  console.log("клиент:", await click("Максим Орлов"));
  await ctx.sleep(1200);
  await ctx.shot(`${prefix}-2-${vp}`, { jpeg: true });
  // первый свободный скутер — плитка с подписью модели
  const picked = await page.evaluate(() => {
    const h = [...document.querySelectorAll("h2")].find((x) => /скутер выдаём/.test(x.textContent || ""));
    const tiles = h ? [...h.parentElement.querySelectorAll("button")].filter((b) => b.querySelector("span span, span")) : [];
    const t = tiles.find((b) => /Jog|Gear|AIMA|Honda/i.test(b.textContent || "") && !/^Все|\(\d+\)$/.test((b.textContent || "").trim()));
    t?.click();
    return t?.textContent?.trim().slice(0, 30) ?? null;
  });
  console.log("скутер:", picked);
  await ctx.sleep(1200);
  await ctx.shot(`${prefix}-3-${vp}`, { jpeg: true });
  console.log("далее:", await click("^Далее"));
  await ctx.sleep(1200);
  await ctx.shot(`${prefix}-4-${vp}`, { jpeg: true });
  console.log("оплата:", await click("^Наличные$"));
  await ctx.sleep(800);
  await ctx.shot(`${prefix}-5-${vp}`, { jpeg: true });
  // шаги наверху нажимаются: назад к сроку
  console.log("шаг 3 из шапки:", await click("^Срок\\d"));
  await ctx.sleep(800);
  await ctx.shot(`${prefix}-6-${vp}`, { jpeg: true });
}
