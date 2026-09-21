/**
 * Карточки клиента и техники на планшете: помещаются ли в экран.
 *   VP=land|port node scripts/shots/shot.mjs scripts/shots/scenarios/tab-cards.mjs
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
    return box.t;
  };

  const scrollInfo = () =>
    page.evaluate(() => {
      const list = [...document.querySelectorAll("*")].filter((e) => {
        const s = getComputedStyle(e);
        return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 8 && e.clientHeight > 200;
      });
      return list.map((e) => `${e.scrollHeight}/${e.clientHeight}`).join(" ") || "нет";
    });

  for (const [route, rx, name] of [
    ["clients", /Алексей Смирнов/, "client"],
    ["fleet", /^Jog3Jog/, "scooter"],
  ]) {
    await ctx.gotoRoute(route);
    await ctx.sleep(2300);
    console.log(`${name}:`, await tap(rx));
    await ctx.sleep(2600);
    console.log(`  прокрутка ${await scrollInfo()}`);
    await ctx.shot(`card-${name}-${vp}`, { jpeg: true });
  }
}
