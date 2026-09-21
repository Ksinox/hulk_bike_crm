/**
 * Что можно нажать в карточке аренды на планшете — и как выглядят окна
 * действий (замена техники, ущерб, продление, завершение).
 *   ACT="Заменить" node scripts/shots/shot.mjs scripts/shots/scenarios/tab-card-actions.mjs
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const vp = process.env.VP ?? "land";
  const act = process.env.ACT ?? "";
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

  const tap = async (rx) => {
    const box = await page.evaluate((src) => {
      const r = new RegExp(src);
      const el = [...document.querySelectorAll("button, [role=button], [role=checkbox], a, li, tr, div[class*=cursor-pointer]")]
        .filter((x) => {
          const b = x.getBoundingClientRect();
          return b.width > 2 && b.height > 2 && r.test((x.textContent || "").trim());
        })
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const b = el.getBoundingClientRect();
      return {
        x: b.left + b.width / 2,
        y: b.top + b.height / 2,
        t: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 36),
      };
    }, rx.source);
    if (!box) return null;
    await page.mouse.click(box.x, box.y);
    return box.t;
  };

  await ctx.gotoRoute("rentals");
  await ctx.sleep(2200);
  console.log("аренда:", await tap(/Алексей Смирнов/));
  await ctx.sleep(2500);
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((b) => (b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 28))
      .filter((t) => t)
      .filter((t, i, a) => a.indexOf(t) === i)
      .slice(0, 45),
  );
  console.log("кнопки карточки:\n  " + buttons.join(" | "));
  await ctx.shot(`card-${vp}`, { jpeg: true });

  if (act) {
    // Действия карточки живут в меню «…» в шапке.
    const dots = await page.evaluate(() => {
      const el = [...document.querySelectorAll("button")].find((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 20 && r.width < 60 && r.top < 70 && r.left > window.innerWidth - 90;
      });
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (dots) {
      await page.mouse.click(dots.x, dots.y);
      await ctx.sleep(900);
    }
    console.log("действие:", await tap(new RegExp(act)));
    await ctx.sleep(2200);
    const m = await page.evaluate(() => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const ov = [...document.querySelectorAll("div")].filter((d) => {
        const s = getComputedStyle(d);
        const r = d.getBoundingClientRect();
        return s.position === "fixed" && r.width > W * 0.8 && r.height > H * 0.6 && +s.zIndex >= 30;
      });
      const last = ov[ov.length - 1];
      if (!last) return { окно: false };
      const panel = [...last.children]
        .map((c) => c.getBoundingClientRect())
        .sort((a, b) => b.width * b.height - a.width * a.height)[0];
      const scroll = [...last.querySelectorAll("*")].filter((e) => {
        const s = getComputedStyle(e);
        return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 8 && e.clientHeight > 120;
      });
      return {
        окно: true,
        ширина: panel ? Math.round(panel.width) : null,
        доля: panel ? Math.round((panel.width / W) * 100) : null,
        прокрутка: scroll.map((e) => `${e.scrollHeight}/${e.clientHeight}`).join(" ") || "нет",
      };
    });
    console.log("окно действия:", JSON.stringify(m));
    await ctx.shot(`card-act-${vp}`, { jpeg: true });
  }
}
