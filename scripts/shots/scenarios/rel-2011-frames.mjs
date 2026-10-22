/**
 * Кадры выпуска 2.0.11 — одинаковым сценарием со старого кода («было») и с
 * нового («стало»). Клиента не создаёт, ничего не сохраняет.
 *   SHOT=client|progress|settings VP=land|phone|desk TAG=was|now \
 *     node scripts/shots/shot.mjs scripts/shots/scenarios/rel-2011-frames.mjs
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const vp = process.env.VP ?? "desk";
  const tag = process.env.TAG ?? "now";
  const what = process.env.SHOT ?? "client";
  if (vp !== "desk") {
    await page.setUserAgent(vp === "phone" ? PHONE_UA : IPAD_UA);
    await page.setViewport(
      vp === "phone"
        ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    );
  } else {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  }
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
  });
  const click = (src) =>
    page.evaluate((src) => {
      const r = new RegExp(src);
      const el = [...document.querySelectorAll("button, a")]
        .filter((x) => {
          const b = x.getBoundingClientRect();
          return b.width > 0 && b.height > 0 && r.test((x.textContent || "").trim());
        })
        .pop();
      el?.click();
      return el ? (el.textContent || "").trim().slice(0, 40) : null;
    }, src);

  if (what === "client") {
    await ctx.gotoRoute("rentals");
    await ctx.sleep(2000);
    console.log("аренда:", await click("^Аренда$"));
    await ctx.sleep(1500);
    console.log("новый клиент:", await click("Новый клиент$"));
    await ctx.sleep(1800);
    await ctx.shot(`rel2011-client-${vp}-${tag}`, { jpeg: true });
  }
  if (what === "progress") {
    // зашли в «Развитие» и вернулись: остался ли значок в меню
    await ctx.shot(`rel2011-progress-before-${vp}-${tag}`, { jpeg: true });
    await ctx.gotoRoute("progress");
    await ctx.sleep(2500);
    await page.keyboard.press("Escape");
    await ctx.sleep(500);
    await ctx.gotoRoute("dashboard");
    await ctx.sleep(2000);
    await ctx.shot(`rel2011-progress-${vp}-${tag}`, { jpeg: true });
  }
  if (what === "code") {
    // окно меняющегося кода: кнопка «Код» в шапке (видна только директору)
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button[title="Меняющийся код директора"]')].find(
        (x) => x.getBoundingClientRect().width > 0,
      );
      b?.click();
    });
    await page.waitForSelector("[data-director-code-sheet]", { timeout: 15000 });
    await ctx.sleep(2500);
    await ctx.shot(`rel2011-code-${vp}-${tag}`, { jpeg: true });
  }
  if (what === "settings") {
    await ctx.gotoRoute("settings");
    await ctx.sleep(2500);
    await page.evaluate(() => {
      const h = [...document.querySelectorAll("div")].find((d) =>
        /^(Ключ директора|Защита директора)$/.test(d.textContent?.trim() ?? ""),
      );
      h?.closest("section")?.scrollIntoView({ block: "start" });
    });
    await ctx.sleep(1200);
    await ctx.shot(`rel2011-settings-${vp}-${tag}`, { jpeg: true });
  }
}
