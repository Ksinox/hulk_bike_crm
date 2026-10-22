/**
 * Аренда → «Новый клиент» → анкета микрошагами (22.10): одно поле — один
 * экран, Enter — дальше. Клиента НЕ сохраняет: доходит до «Проверьте данные».
 *   VP=land|port|phone PREFIX=micro node scripts/shots/shot.mjs scripts/shots/scenarios/tab-client-wizard.mjs
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const vp = process.env.VP ?? "land";
  const prefix = process.env.PREFIX ?? "micro";
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
        // анкета открыта поверх мастера аренды — берём верхнее окно (последнее в DOM)
        .pop();
      el?.click();
      return el ? (el.textContent || "").trim().slice(0, 40) : null;
    }, src);
  const active = () =>
    page.evaluate(() => {
      const a = document.activeElement;
      return a ? `${a.tagName}#${a.id || ""}` : "—";
    });
  const step = async (name, text) => {
    if (text != null) await page.keyboard.type(text, { delay: 12 });
    await ctx.sleep(300);
    await ctx.shot(`${prefix}-${name}-${vp}`, { jpeg: true });
  };

  await ctx.gotoRoute("rentals");
  await ctx.sleep(2000);
  console.log("аренда:", await click("^Аренда$"));
  await ctx.sleep(1500);
  console.log("новый клиент:", await click("Новый клиент$"));
  await ctx.sleep(1500);
  await step("01-photo");
  console.log("пропустить:", await click("^Пропустить"));
  await ctx.sleep(400);
  console.log("фокус на ФИО:", await active());
  await step("02-name", "ТЕСТ Тестов Микрошаг");
  await page.keyboard.press("Enter");
  await ctx.sleep(400);
  console.log("фокус на телефоне:", await active());
  await step("03-phone", "79990001133");
  await page.keyboard.press("Enter");
  await ctx.sleep(400);
  await click("^Пропустить");
  await ctx.sleep(400);
  await step("05-birth", "01021990");
  await page.keyboard.press("Enter");
  await ctx.sleep(400);
  await step("06-source");
  await click("^Авито$");
  await ctx.sleep(700);
  await step("07-doc");
  await click("^Далее");
  await ctx.sleep(400);
  await step("08-passport", "1234567890");
  await page.keyboard.press("Enter");
  await ctx.sleep(300);
  await click("^Пропустить");
  await ctx.sleep(300);
  await click("^Пропустить");
  await ctx.sleep(300);
  await step("11-pcode", "230001");
  await page.keyboard.press("Enter");
  await ctx.sleep(300);
  await step("12-scans");
  await click("^Пропустить");
  await ctx.sleep(300);
  await step("13-reg", "Краснодар, ул. Тестовая, 1");
  await click("^Далее");
  await ctx.sleep(300);
  await click("^Пропустить|^Далее");
  await ctx.sleep(300);
  await step("15-license");
  console.log("кнопки на шаге:", await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.getBoundingClientRect().width > 0).map((b) => (b.textContent || "").trim()).filter(Boolean).join(" | ")));
  await click("^Пропустить");
  await ctx.sleep(300);
  for (let i = 0; i < 4; i++) {
    const onReview = await page.evaluate(() => /Проверьте данные/.test(document.body.innerText));
    if (onReview) break;
    await click("^Пропустить|^Далее");
    await ctx.sleep(500);
  }
  await step("17-review");
}
