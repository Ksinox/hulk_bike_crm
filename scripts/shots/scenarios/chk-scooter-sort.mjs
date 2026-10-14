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
      const head = [...document.querySelectorAll("h2")].find((d) => /^Парк ·/.test((d.textContent || "").trim()));
      if (!head) return "нет";
      const card = head.parentElement.parentElement;
      card.scrollIntoView({ block: "start" });
      window.scrollBy(0, -16);
      return [...card.querySelectorAll("button, a, div")]
        .filter((el) => el.children.length <= 2 && /^\d{1,3}$/.test((el.textContent || "").trim()) && el.getBoundingClientRect().width < 80)
        .map((el) => el.textContent.trim())
        .filter((t, i, arr) => arr.indexOf(t) === i)
        .slice(0, 40)
        .join(" ");
    });
    console.log("панель парка:", tiles);
    await ctx.sleep(600);
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
  // Выбираем тестового клиента (ничего не создаём) и идём на шаг «Скутер».
  if (phase === "phone") {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll("button, [role=button], li, div")]
        .filter((x) => /^ПТПокупкин Тест/.test((x.textContent || "").replace(/\s+/g, "")) || /Покупкин Тест Анкетович/.test(x.textContent || ""))
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      el?.click();
    });
    await ctx.sleep(800);
    await click(/^Далее/);
    await ctx.sleep(1500);
  }
  console.log("выбор в аренде:", await numbers());
  await ctx.shot(`sort-rental-${phase}-${tag}`, { jpeg: true });
}
