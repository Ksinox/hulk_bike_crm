/**
 * Показ 2.0.2 — слайд, добавленный после просмотра (17.09). Перед запуском
 * у shotbot `completed_at` по 2.0.2 отодвигают раньше `addedAt` слайда.
 *   PHASE=desk | phone | tablet, WHEN=was (старая сборка на localhost) | now
 * Кадр — public/progress/v202-tour-extra(-m|-t)-<WHEN>.jpg
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const when = process.env.WHEN ?? "now";
  const sfx = phase === "phone" ? "-m" : phase === "tablet" ? "-t" : "";
  if (phase === "phone") await page.setUserAgent(PHONE_UA);
  if (phase === "tablet") await page.setUserAgent(IPAD_UA);
  await page.setViewport(
    phase === "desk"
      ? { width: 1440, height: 900, deviceScaleFactor: 1 }
      : phase === "phone"
        ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  );
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(8000);
  const st = await page.evaluate(() => ({
    brand: document.querySelector(".rt-brand")?.textContent?.trim() ?? null,
    card: document.querySelector(".rt-card-title")?.textContent ?? null,
    count: document.querySelector(".rt-count")?.textContent ?? null,
  }));
  console.log(`[${phase}/${when}] показ:`, JSON.stringify(st));
  // Ползунок «было / стало» слайда — на «стало».
  await page.evaluate(() => {
    const input = document.querySelector('.rt-media .rt-ba input[type="range"]');
    if (!input) return;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(input, "0");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ctx.sleep(400);
  await ctx.shot(`v202-tour-extra${sfx}-${when}`, { jpeg: true });
}
