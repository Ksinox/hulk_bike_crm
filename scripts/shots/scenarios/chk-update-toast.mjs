/**
 * Тост «новая сборка» (18.09): тот же номер версии — «Доступно обновление»
 * без «Что нового»; новый номер — «Доступна версия X» с «Что нового».
 * Подменяем /version.json и ускоряем проверку (раз в 5 минут → раз в 2 с).
 *   NEXT_APP=2.0.2 | 2.0.3, PHASE=desk | phone
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const next = process.env.NEXT_APP ?? "2.0.2";
  const phase = process.env.PHASE ?? "desk";
  if (phase === "phone") {
    await page.setUserAgent(PHONE_UA);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  } else {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  }
  let calls = 0;
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (req.url().includes("/version.json")) {
      calls += 1;
      const body = calls <= 2 ? { version: "build.A", appVersion: "2.0.2" } : { version: "build.B", appVersion: next };
      req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      return;
    }
    req.continue();
  });
  await page.evaluateOnNewDocument(() => {
    const orig = window.setInterval;
    window.setInterval = (fn, ms, ...rest) => orig(fn, ms === 5 * 60 * 1000 ? 2000 : ms, ...rest);
  });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(9000);
  const toast = await page.evaluate(() => {
    const t = [...document.querySelectorAll("div")].find((d) => /Доступн(а версия|о обновление)/.test(d.textContent || "") && d.children.length < 12);
    return t ? t.innerText.replace(/\n+/g, " | ").slice(0, 200) : null;
  });
  console.log(`[${phase}] версия ${next}, запросов version.json ${calls}:`, toast);
  await ctx.shot(process.env.SHOT_NAME ?? `update-toast-${phase}-${next.replace(/\./g, "")}`, { jpeg: true });
}
