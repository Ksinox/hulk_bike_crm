/**
 * Как на планшете открываются карточки: список → нажали строку → карточка.
 * Снимает пару кадров на каждый раздел, чтобы видеть сам переход.
 *   VP=land|port node scripts/shots/shot.mjs scripts/shots/scenarios/tab-drill.mjs
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
  await ctx.sleep(7000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Посмотрю позже|^Позже$/.test(b.textContent || ""))?.click();
  });
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
  });

  const tap = async (rx, pause = 2600) => {
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
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, t: (el.textContent || "").trim().slice(0, 30) };
    }, rx.source);
    if (!box) return null;
    await page.mouse.click(box.x, box.y);
    await ctx.sleep(pause);
    return box.t;
  };

  const back = async () => {
    await page.keyboard.press("Escape");
    await ctx.sleep(600);
    await tap(/^(Скрыть|Назад|Закрыть)$/, 900);
  };

  const steps = [
    ["rentals", /Алексей Смирнов/, "rental"],
    ["clients", /Алексей Смирнов/, "client"],
    ["fleet", /^Jog3Jog/, "scooter"],
  ];
  for (const [route, rx, name] of steps) {
    await ctx.gotoRoute(route);
    await ctx.sleep(2400);
    await ctx.shot(`drill-${name}-1-list-${vp}`, { jpeg: true });
    console.log(`${name}:`, await tap(rx));
    await ctx.shot(`drill-${name}-2-card-${vp}`, { jpeg: true });
    const info = await page.evaluate(() => {
      const nav = [...document.querySelectorAll("nav")].find((n) => /Главная/.test(n.innerText || ""));
      const r = nav?.getBoundingClientRect();
      return {
        нижняяПанельВидна: !!r && r.bottom <= window.innerHeight + 1 && r.height > 0,
        естьКнопкаНазад: /Скрыть|Назад/.test(document.body.innerText),
      };
    });
    console.log("  ", JSON.stringify(info));
    await back();
  }
}
