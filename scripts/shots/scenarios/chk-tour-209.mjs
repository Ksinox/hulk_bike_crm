/**
 * Показ выпуска 2.0.9 (SHOT_TOUR=1): пролистать карточки и снять каждую.
 * В конце — «Посмотрю позже», чтобы показ можно было пройти ещё раз.
 *   SHOT_TOUR=1 PHASE=desk|phone node scripts/shots/shot.mjs scripts/shots/scenarios/chk-tour-209.mjs
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  if (phase === "phone") {
    await page.setUserAgent(PHONE_UA);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  } else {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  }
  const click = (re) =>
    page.evaluate((src) => {
      const rx = new RegExp(src);
      const el = [...document.querySelectorAll("button")]
        .filter((x) => x.getBoundingClientRect().width > 0 && rx.test((x.textContent || "").trim()))
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      el?.click();
      return el ? (el.textContent || "").trim().slice(0, 40) : null;
    }, re.source);
  const state = () =>
    page.evaluate(() => ({
      бренд: document.querySelector(".rt-brand")?.textContent ?? null,
      карточка: document.querySelector(".rt-card-title")?.textContent ?? null,
      счёт: document.querySelector(".rt-count")?.textContent ?? null,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));

  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(7000);
  // Если до 2.0.9 висят непросмотренные выпуски — листаем их до 2.0.9.
  for (let guard = 0; guard < 40; guard++) {
    const st = await state();
    if (!st.карточка) {
      if (!(await click(/^Смотреть, что нового$|^Продолжить/))) break;
      await ctx.sleep(1200);
      continue;
    }
    if (/2\.0\.9/.test(st.бренд ?? "")) break;
    await click(/^(Дальше|Готово)/);
    await ctx.sleep(900);
  }
  for (let i = 1; i <= 6; i++) {
    const st = await state();
    console.log(`карточка ${i}:`, JSON.stringify(st));
    if (!st.карточка) break;
    await ctx.sleep(900);
    await ctx.shot(`tour209-${phase}-${i}`, { jpeg: true });
    if (/^(\d) из \1$/.test(st.счёт ?? "")) break;
    await click(/^Дальше/);
    await ctx.sleep(1100);
  }
  console.log("позже:", await click(/^Посмотрю позже$/));
}
