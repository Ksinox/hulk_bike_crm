/**
 * Точечная проверка одного раздела на планшете.
 *
 * Меряет не «отрендерилось», а вёрстку: что вылезает за правый край, какие
 * блоки уже своего контента, есть ли обрезанные подписи.
 *   ROUTE=partners VP=land node scripts/shots/shot.mjs scripts/shots/scenarios/tab-probe.mjs
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const vp = process.env.VP ?? "land";
  const routes = (process.env.ROUTE ?? "partners").split(",");
  await page.setUserAgent(IPAD_UA);
  await page.setViewport(
    vp === "port"
      ? { width: 820, height: 1180, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
      : { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  );
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Посмотрю позже|^Позже$/.test(b.textContent || ""))?.click();
  });
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
  });

  for (const route of routes) {
    await ctx.gotoRoute(route);
    await ctx.sleep(2600);
    const rep = await page.evaluate(() => {
      const W = window.innerWidth;
      const out = { заКрай: [], обрезано: [], ширина: W };
      document.querySelectorAll("*").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        if (r.right > W + 1 && r.width < W * 1.6) {
          const t = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 32);
          if (t) out.заКрай.push(`${el.tagName.toLowerCase()} +${Math.round(r.right - W)}px «${t}»`);
        }
        // обрезанный текст: контент шире видимой части
        if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 20) {
          const t = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 32);
          if (t) out.обрезано.push(`«${t}» ${el.clientWidth}<${el.scrollWidth}`);
        }
      });
      out.заКрай = [...new Set(out.заКрай)].slice(0, 12);
      out.обрезано = [...new Set(out.обрезано)].slice(0, 12);
      return out;
    });
    console.log(`\n=== ${route} (${vp}) ширина ${rep.ширина}`);
    console.log("за правый край:", rep.заКрай.length ? "\n  " + rep.заКрай.join("\n  ") : "нет");
    console.log("обрезанный текст:", rep.обрезано.length ? "\n  " + rep.обрезано.join("\n  ") : "нет");
    await ctx.shot(`probe-${route}-${vp}`, { jpeg: true });
  }
}
