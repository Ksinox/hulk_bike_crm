/**
 * Проход мастера по шагам на планшете — с замером на каждом шаге.
 *   WALK=rental|sale|buyout|staff|service VP=land|port \
 *     node scripts/shots/shot.mjs scripts/shots/scenarios/tab-walk.mjs
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

const WALKS = {
  rental: {
    route: "rentals",
    open: /^Аренда$/,
    steps: [[/Максим Орлов/], [/^Далее$/], [/^Далее$/], [/^Далее$/]],
  },
  sale: {
    route: "sales",
    open: /^Сделки$/,
    after: /^Продажа$/,
    steps: [[/Максим Орлов/], [/^Далее$/], [/^Далее$/], [/^Далее$/]],
  },
  buyout: { route: "rassrochki", open: /^Выкуп$/, steps: [[/Максим Орлов/], [/^Далее$/], [/^Далее$/]] },
  staff: { route: "staff", open: /^Новый сотрудник$/, steps: [] },
  service: { route: "service", open: /^Новый ремонт$/, steps: [] },
};

export async function run(page, ctx) {
  const vp = process.env.VP ?? "land";
  const key = process.env.WALK ?? "rental";
  const w = WALKS[key];
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

  const click = (rx) =>
    page.evaluate((src) => {
      const r = new RegExp(src);
      const el = [...document.querySelectorAll("button, [role=button], a, li, tr")]
        .filter((x) => {
          const b = x.getBoundingClientRect();
          return b.width > 0 && b.height > 0 && r.test((x.textContent || "").trim());
        })
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      el?.click();
      return el ? (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 36) : null;
    }, rx.source);

  const scrolls = () =>
    page.evaluate(() => {
      const bad = [...document.querySelectorAll("*")].filter((e) => {
        const s = getComputedStyle(e);
        return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 8 && e.clientHeight > 120;
      });
      return bad.map((e) => `${e.scrollHeight}/${e.clientHeight}`).join(" ") || "нет";
    });

  await ctx.gotoRoute(w.route);
  await ctx.sleep(2400);
  console.log("открыли:", await click(w.open));
  await ctx.sleep(1500);
  if (w.after) {
    console.log("далее:", await click(w.after));
    await ctx.sleep(1600);
  }
  await ctx.shot(`walk-${key}-1-${vp}`, { jpeg: true });
  console.log(`шаг 1 · прокрутка ${await scrolls()}`);
  let i = 1;
  for (const chain of w.steps) {
    for (const rx of chain) {
      const hit = await click(rx);
      await ctx.sleep(1500);
      if (!hit) console.log("  не нашли:", rx.source);
    }
    i += 1;
    await ctx.shot(`walk-${key}-${i}-${vp}`, { jpeg: true });
    console.log(`шаг ${i} · прокрутка ${await scrolls()}`);
  }
}
