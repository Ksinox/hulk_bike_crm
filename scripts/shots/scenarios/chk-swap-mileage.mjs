/**
 * Замена скутера: пробег снятого скутера (17.10, заказчик: «при замене
 * система должна запрашивать пробег — скутер возвращается в парк»).
 * Открывает замену в аренде и снимает шаги; саму замену НЕ выполняет.
 *   PHASE=desk|tablet|phone TAG=was|now [CLIENT="Алексей Смирнов"] \
 *     node scripts/shots/shot.mjs scripts/shots/scenarios/chk-swap-mileage.mjs
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const tag = process.env.TAG ?? "now";
  const client = process.env.CLIENT ?? "Алексей Смирнов";
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

  /** Клик по самому «узкому» видимому элементу с подходящим текстом. */
  const click = (rx, sel = "button, [role=button], a, li, tr, div[class*=cursor-pointer]") =>
    page.evaluate(
      (src, sel) => {
        const r = new RegExp(src);
        const el = [...document.querySelectorAll(sel)]
          .filter((x) => {
            const b = x.getBoundingClientRect();
            return b.width > 0 && b.height > 0 && r.test((x.textContent || "").trim());
          })
          .sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.click();
        return el ? (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50) : null;
      },
      rx.source,
      sel,
    );

  /** Ввод в поле пробега снятого скутера (через нативный setter — React видит). */
  const typeMileage = (v) =>
    page.evaluate((val) => {
      const inp = document.querySelector('input[aria-label="Пробег снятого скутера"]');
      if (!inp) return false;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(inp, val);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }, v);

  /** Плитка свободного скутера в окне замены. */
  const pickTile = () =>
    page.evaluate(() => {
      const tile = [...document.querySelectorAll('div[class*="z-[120]"] button')].find((b) => {
        const t = (b.textContent || "").trim();
        return /\d/.test(t) && t.length < 24 && !/Далее|Назад|Заменить|Отмена/.test(t) && b.getBoundingClientRect().width > 0;
      });
      tile?.click();
      return tile ? (tile.textContent || "").trim() : null;
    });
  const dialogText = () =>
    page.evaluate(() => {
      const t = document.body.innerText;
      const i = t.indexOf("Замена скутера");
      return i < 0 ? "окно не открыто" : t.slice(i, i + 700).replace(/\s+/g, " ");
    });

  await ctx.gotoRoute("rentals");
  await ctx.sleep(3000);
  console.log("аренда:", await click(new RegExp(client)));
  await ctx.sleep(2500);
  const opened = await page.evaluate(() => {
    const el =
      [...document.querySelectorAll('[title^="Заменить скутер"]')].find((x) => x.getBoundingClientRect().width > 0) ??
      [...document.querySelectorAll("button")].find((b) => /^Заменить$/.test((b.textContent || "").trim()) && b.getBoundingClientRect().width > 0);
    el?.click();
    return !!el;
  });
  console.log("замена открыта:", opened);
  await ctx.sleep(2000);
  console.log("окно:", await dialogText());
  await ctx.shot(`swap-${phase}-${tag}-1`, { jpeg: true });
  if (tag !== "now") return;

  // Меньше записанного — предупреждение и «Это исправление».
  const stored0 = await page.evaluate(() => {
    const m = document.body.innerText.match(/было ([\d\s ]+)/);
    return m ? Number(m[1].replace(/\D/g, "")) : 0;
  });
  console.log("было:", stored0, "ввод меньше:", await typeMileage(String(Math.max(0, stored0 - 1000) || 5)));
  await ctx.sleep(700);
  await ctx.shot(`swap-${phase}-${tag}-2-lower`, { jpeg: true });
  // Лишние цифры.
  await typeMileage("45674567");
  await ctx.sleep(700);
  await ctx.shot(`swap-${phase}-${tag}-3-big`, { jpeg: true });
  // Нормальный пробег — «+N км за аренду».
  await typeMileage(String(stored0 + 150));
  await ctx.sleep(700);
  console.log("окно после ввода:", await dialogText());
  await ctx.shot(`swap-${phase}-${tag}-4-ok`, { jpeg: true });

  if (phase === "desk") {
    // Причина и новый скутер — кнопка становится активной (не нажимаем).
    await click(/^Поломка$/);
    await ctx.sleep(400);
    console.log("плитка:", await pickTile());
    await ctx.sleep(700);
    await ctx.shot(`swap-${phase}-${tag}-5-ready`, { jpeg: true });
    return;
  }
  // Телефон / планшет: шаги мастера до проверки.
  await click(/^Далее/);
  await ctx.sleep(700);
  await click(/^Поломка$/);
  await ctx.sleep(400);
  await click(/^Далее/);
  await ctx.sleep(900);
  console.log("плитка:", await pickTile());
  await ctx.sleep(500);
  await click(/^Далее/);
  await ctx.sleep(900);
  console.log("проверка:", await dialogText());
  await ctx.shot(`swap-${phase}-${tag}-5-summary`, { jpeg: true });
}
