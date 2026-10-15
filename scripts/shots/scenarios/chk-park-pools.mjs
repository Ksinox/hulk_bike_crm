/**
 * Плитки парка на главной: бензин / электро / без номера (15.10, заказчик:
 * «после 70 снова 1, 2, 3 — непонятно; электро — со значками»).
 * Снимает панель парка и печатает, что на плитках.
 *   PHASE=desk|tablet|phone TAG=was|now node scripts/shots/shot.mjs \
 *     scripts/shots/scenarios/chk-park-pools.mjs
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
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(3000);

  /** Карточка «Парк · N скутеров»: прокрутить к ней и вернуть рамку для кадра. */
  const frame = () =>
    page.evaluate(() => {
      const head = [...document.querySelectorAll("h2, div")].find((d) =>
        /^Парк · \d+/.test((d.textContent || "").trim()) && d.children.length === 0,
      );
      if (!head) return null;
      let card = head;
      while (card.parentElement && !/(^|\s)shadow-card(\s|$)/.test(String(card.className))) card = card.parentElement;
      card.scrollIntoView({ block: "start" });
      // Прокрутка может жить во внутреннем контейнере — даём отступ сверху.
      window.scrollBy(0, -12);
      const r = card.getBoundingClientRect();
      const text = card.innerText.replace(/\s+/g, " ").slice(0, 400);
      return {
        x: Math.max(0, r.left - 6),
        y: Math.max(0, r.top - 6),
        width: Math.min(window.innerWidth, r.width + 12),
        height: Math.max(1, Math.min(window.innerHeight - Math.max(0, r.top - 6), r.height + 12)),
        text,
      };
    });

  const shoot = async (name) => {
    await ctx.sleep(700);
    const f = await frame();
    if (!f) {
      console.log("панель парка не найдена");
      await ctx.shot(name, { jpeg: true });
      return;
    }
    await ctx.sleep(500);
    const g = await frame();
    console.log(`${name}:`, g.text);
    // Кроп — по рамке карточки уже после съёмки (clip у шота меняет метрики).
    console.log(`rect ${name} ${Math.round(g.x)} ${Math.round(g.y)} ${Math.round(g.width)} ${Math.round(g.height)}`);
    await ctx.shot(name, { jpeg: true });
  };

  await shoot(`park-${phase}-${tag}`);

  // Компьютер: самый мелкий масштаб — 18 в ряду.
  if (phase === "desk") {
    await page.evaluate(() => {
      const r = document.querySelector('input[type="range"]');
      if (!r) return;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(r, "18");
      r.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await shoot(`park-${phase}-18-${tag}`);
  }
}
