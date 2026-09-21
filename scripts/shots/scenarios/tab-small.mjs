/**
 * Небольшие окна на планшете: статус техники, замена масла, пополнение
 * залога, экипировка. Проверяем, что это аккуратные окна, а не растянутые
 * на весь экран полосы, и что по ним удобно попадать пальцем.
 *   VP=land|port node scripts/shots/shot.mjs scripts/shots/scenarios/tab-small.mjs
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const vp = process.env.VP ?? "land";
  await page.setUserAgent(IPAD_UA);
  await page.setViewport(
    vp === "port"
      ? { width: 820, height: 1180, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
      : { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  );
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6800);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Посмотрю позже|^Позже$/.test(b.textContent || ""))?.click();
  });
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
  });

  const tap = async (rx, pause = 1600) => {
    const box = await page.evaluate((src) => {
      const r = new RegExp(src);
      const el = [...document.querySelectorAll("button, [role=button], a, li, tr, div[class*=cursor-pointer]")]
        .filter((x) => {
          const b = x.getBoundingClientRect();
          return b.width > 2 && b.height > 2 && r.test((x.textContent || "").trim());
        })
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, t: (el.textContent || "").trim().slice(0, 28) };
    }, rx.source);
    if (!box) return null;
    await page.mouse.click(box.x, box.y);
    await ctx.sleep(pause);
    return box.t;
  };

  /** Размер окна и мелкие тач-цели в нём. */
  const win = () =>
    page.evaluate(() => {
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
        .map((c) => ({ el: c, r: c.getBoundingClientRect() }))
        .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0];
      const small = [...panel.el.querySelectorAll("button, input, [role=button], [role=checkbox]")].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.height > 0 && r.height < 44;
      }).length;
      return {
        окно: true,
        ширина: Math.round(panel.r.width),
        высота: Math.round(panel.r.height),
        заЭкраном: panel.r.bottom > H + 1 || panel.r.right > W + 1,
        мелких: small,
      };
    });

  const reset = async (route) => {
    await page.keyboard.press("Escape");
    await ctx.sleep(600);
    await tap(/^(Отмена|Закрыть|Скрыть)$/, 600);
    await ctx.gotoRoute(route);
    await ctx.sleep(2200);
  };

  // Статус техники и замена масла — из карточки скутера
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2400);
  await tap(/^Jog3Jog/, 2400);
  console.log("статус:", await tap(/^Изменить статус$/, 1800), JSON.stringify(await win()));
  await ctx.shot(`small-status-${vp}`, { jpeg: true });
  await page.keyboard.press("Escape");
  await ctx.sleep(800);
  console.log("масло:", await tap(/^Зафиксировать замену$/, 1800), JSON.stringify(await win()));
  await ctx.shot(`small-oil-${vp}`, { jpeg: true });

  // Пополнение залога и экипировка — из карточки аренды
  await reset("rentals");
  await tap(/Алексей Смирнов/, 2600);
  console.log("залог:", await tap(/^Пополнить$/, 1800), JSON.stringify(await win()));
  await ctx.shot(`small-deposit-${vp}`, { jpeg: true });
  await page.keyboard.press("Escape");
  await ctx.sleep(800);
  console.log("экипировка:", await tap(/^Добавить$/, 1800), JSON.stringify(await win()));
  await ctx.shot(`small-equip-${vp}`, { jpeg: true });
}
