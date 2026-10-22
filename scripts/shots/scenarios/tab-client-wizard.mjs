/**
 * Аренда → «Новый клиент» → анкета по шагам (22.10). Клиента НЕ сохраняет:
 * доходит до последнего шага и снимает кадры.
 *   VP=land|port|phone PREFIX=newcli node scripts/shots/shot.mjs scripts/shots/scenarios/tab-client-wizard.mjs
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const vp = process.env.VP ?? "land";
  const prefix = process.env.PREFIX ?? "newcli";
  await page.setUserAgent(vp === "phone" ? PHONE_UA : IPAD_UA);
  await page.setViewport(
    vp === "phone"
      ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : vp === "port"
        ? { width: 820, height: 1180, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
        : { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  );
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
  });
  const click = (src) =>
    page.evaluate((src) => {
      const r = new RegExp(src);
      const el = [...document.querySelectorAll("button")]
        .filter((x) => {
          const b = x.getBoundingClientRect();
          return b.width > 0 && b.height > 0 && r.test((x.textContent || "").trim());
        })
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      el?.click();
      return el ? (el.textContent || "").trim().slice(0, 40) : null;
    }, src);
  const type = async (id, text) => {
    await page.click(`#${id}`);
    await page.keyboard.type(text, { delay: 15 });
  };

  await ctx.gotoRoute("rentals");
  await ctx.sleep(2000);
  console.log("аренда:", await click("^Аренда$"));
  await ctx.sleep(1500);
  console.log("новый клиент:", await click("Новый клиент$"));
  await ctx.sleep(1500);
  await ctx.shot(`${prefix}-1-${vp}`, { jpeg: true });
  // «Далее» без данных — подсветка обязательных полей шага
  await click("^Далее");
  await ctx.sleep(600);
  await ctx.shot(`${prefix}-1b-${vp}`, { jpeg: true });
  await type("f-name", "ТЕСТ Тестов Мастер");
  await type("f-phone", "79990001122");
  await type("f-birth", "01.02.1990");
  await click("^Авито$");
  await ctx.sleep(500);
  console.log("далее 1:", await click("^Далее"));
  await ctx.sleep(900);
  await ctx.shot(`${prefix}-2-${vp}`, { jpeg: true });
  console.log("шаги наверху:", await click("^1\\.? ?Клиент$|^Клиент$"));
  await ctx.sleep(700);
  await ctx.shot(`${prefix}-3-${vp}`, { jpeg: true });
}
