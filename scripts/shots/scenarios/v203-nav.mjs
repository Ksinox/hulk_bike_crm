/**
 * 2.0.3 — навигация: «Что нового» → вкладка «Что уже сделано» в «Развитии»,
 * «Хранилище» → вкладка в «Настройках». Кадры боковой панели, «Ещё»
 * на телефоне, «Развития» и «Настроек».
 *   PHASE=desk | phone | tablet, WHEN=was | now
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const when = process.env.WHEN ?? "now";
  const tag = process.env.TAG ?? "";
  const sfx = phase === "phone" ? "-m" : phase === "tablet" ? "-t" : "";
  const S = (n) => ctx.shot(`v203-${n}${sfx}${tag}-${when}`, { jpeg: true });
  const sleep = ctx.sleep;
  const click = (re, scope = "body") =>
    page.evaluate(
      (src, scope) => {
        const rx = new RegExp(src);
        const root = document.querySelector(scope) ?? document.body;
        const el = [...root.querySelectorAll("button")].filter((x) => {
          const r = x.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && rx.test((x.textContent || "").trim());
        })[0];
        el?.click();
        return el ? (el.textContent || "").trim().slice(0, 40) : null;
      },
      re.source,
      scope,
    );
  if (phase === "phone") await page.setUserAgent(PHONE_UA);
  if (phase === "tablet") await page.setUserAgent(IPAD_UA);
  await page.setViewport(
    phase === "desk"
      ? { width: 1440, height: 900, deviceScaleFactor: 1 }
      : phase === "phone"
        ? { width: Number(process.env.PHONE_W ?? 390), height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  );
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await sleep(5500);

  // Меню разделов
  if (phase === "desk") {
    await page.mouse.move(34, 420);
    await sleep(900);
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll("aside button, nav button")].map((b) => (b.textContent || "").trim()).filter(Boolean).slice(0, 30),
    );
    console.log("боковая панель:", labels.join(" | "));
    await S("nav");
    await page.mouse.move(900, 500);
    await sleep(500);
  } else {
    console.log("«Ещё»:", await click(/^Ещё$/));
    await sleep(900);
    const items = await page.evaluate(() =>
      [...document.querySelectorAll('[data-tour^="nav-"]')].map((b) => (b.textContent || "").trim()),
    );
    console.log("шторка «Ещё»:", items.join(" | "));
    await S("more");
    await page.keyboard.press("Escape");
    await page.evaluate(() => document.querySelector(".fixed.inset-0.z-50")?.click());
    await sleep(600);
  }

  // Развитие
  await ctx.gotoRoute("progress");
  await sleep(2500);
  // Окно «Свежие правки» у «Текущих работ» — закрываем «Позже»
  await click(/^Позже$/);
  await sleep(600);
  console.log("вкладки «Развития»:", await page.evaluate(() => [...document.querySelectorAll("[data-dev-tab]")].map((b) => b.textContent?.trim()).join(" | ") || "нет"));
  await S("dev");
  if (when === "now") {
    await page.evaluate(() => document.querySelector('[data-dev-tab="done"]')?.click());
    await sleep(1500);
    console.log("«Что уже сделано»:", await page.evaluate(() => document.querySelector("h1, h2")?.textContent?.slice(0, 60)));
    await S("dev-done");
  } else {
    await ctx.gotoRoute("whats-new");
    await sleep(2000);
    await S("whatsnew");
  }

  // Настройки
  await ctx.gotoRoute("settings");
  await sleep(2000);
  console.log("вкладки «Настроек»:", await page.evaluate(() => [...document.querySelectorAll("[data-settings-tab]")].map((b) => b.textContent?.trim()).join(" | ") || "нет"));
  await S("settings");
  if (when === "now") {
    await page.evaluate(() => document.querySelector('[data-settings-tab="storage"]')?.click());
    await sleep(2500);
    await S("settings-storage");
  } else if (phase === "desk") {
    await ctx.gotoRoute("storage");
    await sleep(2000);
    await S("storage");
  }
}
