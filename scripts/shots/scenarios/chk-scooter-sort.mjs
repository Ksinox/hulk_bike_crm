/**
 * Порядок техники по арендным номерам (13.10, заказчик: «сортировку по
 * номерам скутеров»). Снимает список парка, окно выбора скутера в новой
 * аренде и (на компьютере) панель парка на главной; печатает номера в том
 * порядке, в каком они стоят на экране.
 *   PHASE=desk|tablet|phone TAG=was|now node scripts/shots/shot.mjs \
 *     scripts/shots/scenarios/chk-scooter-sort.mjs
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const tag = process.env.TAG ?? "now";
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

  /** Номера-кружки на экране — в порядке появления (электро помечены «э»). */
  const numbers = (scope) =>
    page.evaluate((sel) => {
      const root = sel ? document.querySelector(sel) ?? document : document;
      return [...root.querySelectorAll("[data-slot-pool]")]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .map((el) => (el.getAttribute("data-slot-pool") === "electric" ? "э" : "") + el.textContent.trim())
        .slice(0, 60)
        .join(" ");
    }, scope ?? null);

  const click = (rx) =>
    page.evaluate((src) => {
      const r = new RegExp(src);
      const el = [...document.querySelectorAll("button, [role=button]")]
        .filter((x) => {
          const b = x.getBoundingClientRect();
          return b.width > 0 && b.height > 0 && r.test((x.textContent || "").trim());
        })
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      el?.click();
      return !!el;
    }, rx.source);

  // ── 1. Список парка ──
  await ctx.gotoRoute("fleet");
  await ctx.sleep(3000);
  console.log("парк:", await numbers());
  await page.evaluate(() => window.scrollTo(0, 0));
  await ctx.shot(`sort-fleet-${phase}-${tag}`, { jpeg: true });

  // ── 2. Новая аренда: выбор скутера ──
  if (phase === "desk") {
    await ctx.gotoRoute("dashboard");
    await ctx.sleep(2500);
    // ── 3. Панель парка на главной: номера на плитках ──
    const tiles = await page.evaluate(() => {
      const head = [...document.querySelectorAll("h2, h3, div, span")].find((d) => /^Парк скутеров|^Парк$/.test((d.textContent || "").trim()));
      return head ? "есть" : "нет";
    });
    console.log("панель парка:", tiles);
    await ctx.shot(`sort-park-${phase}-${tag}`, { jpeg: true });
    await click(/^Новая сделка/);
    await ctx.sleep(900);
    await click(/^АрендаСкутер напрокат|Скутер напрокат/);
  } else {
    await ctx.gotoRoute("rentals");
    await ctx.sleep(2500);
    await click(/^Аренда$/);
  }
  await ctx.sleep(2500);
  // На телефоне скутер выбирают на своём шаге — листаем мастер до него.
  if (phase === "phone") {
    for (let i = 0; i < 3; i++) {
      const has = await page.evaluate(() => document.querySelectorAll("[data-slot-pool]").length);
      if (has > 0) break;
      await click(/^(Скутер|Выбрать скутер|Далее)$/);
      await ctx.sleep(1200);
    }
  }
  console.log("выбор в аренде:", await numbers());
  await ctx.shot(`sort-rental-${phase}-${tag}`, { jpeg: true });
}
