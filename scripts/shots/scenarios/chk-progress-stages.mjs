/**
 * «Развитие» по этапам (13.10): открытый этап сверху, закрытый — свёрнут.
 * Снимает страницу, раскрывает карточку прошлого этапа и снимает ещё раз.
 *   PHASE=desk|tablet|phone node scripts/shots/shot.mjs scripts/shots/scenarios/chk-progress-stages.mjs
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  if (phase === "tablet") await page.setUserAgent(IPAD_UA);
  if (phase === "phone") await page.setUserAgent(PHONE_UA);
  await page.setViewport(
    phase === "tablet"
      ? { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
      : phase === "phone"
        ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : { width: 1440, height: 900, deviceScaleFactor: 1 },
  );
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(7000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Посмотрю позже|^Позже$/.test(b.textContent || ""))?.click();
  });
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
  });
  await ctx.gotoRoute("progress");
  await ctx.sleep(2600);
  // окно «свежие правки» — закрываем
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /^Позже$/.test((b.textContent || "").trim()))?.click();
  });
  await ctx.sleep(700);
  const info = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      этап2: /Этап 2/.test(t) && /Исправление/.test(t),
      дата: /с 13 октября 2026/.test(t),
      пунктБага: /Пробег при приёмке больше не теряется/.test(t),
      этап1Свернут: /Этап 1 · завершён/.test(t) && !/Финансы: запись в окне/.test(t),
    };
  });
  console.log("страница:", JSON.stringify(info));
  await page.evaluate(() => window.scrollTo(0, 0));
  await ctx.shot(`stages-1-${phase}`, { jpeg: true });

  // раскрыть прошлый этап
  const box = await page.evaluate(() => {
    const el = [...document.querySelectorAll("button")].find((b) => /Этап 1 · завершён/.test(b.textContent || ""));
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (box) await page.mouse.click(box.x, box.y);
  await ctx.sleep(1500);
  const opened = await page.evaluate(() => ({
    раскрыт: /Финансы: запись в окне/.test(document.body.innerText),
  }));
  console.log("после нажатия:", JSON.stringify(opened));
  await ctx.shot(`stages-2-${phase}`, { jpeg: true });
}
