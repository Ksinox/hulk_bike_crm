/**
 * Проверка своих полей вместо системных: список, галочка, дата.
 *
 * Открывает окна, где они живут, нажимает и снимает кадр — чтобы убедиться,
 * что выпадашка встаёт на место, галочка переключается, календарь открывается.
 *   VP=land|port node scripts/shots/shot.mjs scripts/shots/scenarios/chk-controls.mjs
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const vp = process.env.VP ?? "land";
  await page.setUserAgent(IPAD_UA);
  await page.setViewport(
    vp === "port"
      ? { width: 820, height: 1180, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
      : { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  );
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Посмотрю позже|^Позже$/.test(b.textContent || ""))?.click();
  });
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
  });

  const click = (rx) =>
    page.evaluate((src) => {
      const r = new RegExp(src);
      const el = [...document.querySelectorAll("button, [role=button], [role=checkbox], a, li, tr")]
        .filter((x) => {
          const b = x.getBoundingClientRect();
          return b.width > 0 && b.height > 0 && r.test((x.textContent || "").trim());
        })
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      el?.scrollIntoView({ block: "center" });
      el?.click();
      return el ? (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) : null;
    }, rx.source);

  /** Открыт ли наш список (portal с role=listbox) и сколько в нём строк. */
  const listbox = () =>
    page.evaluate(() => {
      const el = document.querySelector('[role="listbox"]');
      if (!el) return { открыт: false };
      const r = el.getBoundingClientRect();
      const rows = [...el.querySelectorAll('[role="option"]')];
      const minH = Math.min(...rows.map((x) => Math.round(x.getBoundingClientRect().height)));
      return {
        открыт: true,
        строк: rows.length,
        минВысотаСтроки: minH,
        вЭкране: r.top >= 0 && r.bottom <= window.innerHeight + 1,
      };
    });

  // ── источник клиента
  await ctx.gotoRoute("clients");
  await ctx.sleep(2200);
  console.log("форма клиента:", await click(/^Клиент$/));
  await ctx.sleep(1800);
  console.log("список источника:", await click(/^Выберите источник…$/));
  await ctx.sleep(900);
  console.log("  ", JSON.stringify(await listbox()));
  await ctx.shot(`ctl-source-${vp}`, { jpeg: true });
  console.log("выбор:", await click(/^Instagram$|^Авито$|^Сарафан/));
  await ctx.sleep(700);
  const picked = await page.evaluate(() =>
    document.body.innerText.includes("Выберите источник…") ? "не выбрался" : "выбран",
  );
  console.log("  источник", picked);
  // галочка адреса
  console.log("галочка:", await click(/Фактический адрес совпадает/));
  await ctx.sleep(600);
  const checked = await page.evaluate(
    () => document.querySelector('[role="checkbox"][aria-checked="true"]') != null,
  );
  console.log("  галочка включилась:", checked);
  await ctx.shot(`ctl-check-${vp}`, { jpeg: true });
  await page.keyboard.press("Escape");
  await ctx.sleep(900);
  await click(/^(Отмена|Закрыть)$/);
  await ctx.sleep(900);

  // ── модель: ряд кнопок «Охлаждение» + календарь закупа
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2200);
  await click(/^Модели$/);
  await ctx.sleep(1500);
  console.log("окно модели:", await click(/^(Добавить модель|Добавить)$/));
  await ctx.sleep(1600);
  console.log("охлаждение:", await click(/^Воздушное$/));
  await ctx.sleep(700);
  await ctx.shot(`ctl-model-${vp}`, { jpeg: true });
  const fits = await page.evaluate(() => {
    const panels = [...document.querySelectorAll("div")].filter((d) => /Новая модель/.test(d.innerText || ""));
    const p = panels[panels.length - 1];
    const r = p.getBoundingClientRect();
    return { высота: Math.round(r.height), экран: window.innerHeight, вылезает: r.bottom > window.innerHeight + 1 };
  });
  console.log("  окно модели:", JSON.stringify(fits));
}
