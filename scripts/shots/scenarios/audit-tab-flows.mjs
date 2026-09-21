/**
 * Инвентаризация ФЛОУ на планшете (21.09, по правке заказчика).
 *
 * Разделы — это полдела: заказчик работает в окнах, где что-то заводят и
 * правят. Сценарий открывает каждое такое окно на планшете и меряет:
 *   • какую долю экрана занимает панель окна (модалка 720px на 1180 — 61%);
 *   • нужна ли прокрутка внутри и сколько её;
 *   • сколько кнопок/полей мельче 44px (палец промахивается).
 *
 *   FLOW=all|rental,client,... VP=land|port node scripts/shots/shot.mjs \
 *     scripts/shots/scenarios/audit-tab-flows.mjs
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

/** Флоу: куда идём и по каким кнопкам кликаем, чтобы окно открылось. */
const FLOWS = [
  { id: "rental", label: "Новая аренда", route: "rentals", clicks: [/^Аренда$/] },
  { id: "client", label: "Новый клиент", route: "clients", clicks: [/^Клиент$/] },
  { id: "scooter", label: "Добавить технику", route: "fleet", clicks: [/^Скутер$/] },
  { id: "service", label: "Новый ремонт", route: "service", clicks: [/^Новый ремонт$/] },
  { id: "sale", label: "Новая продажа", route: "sales", clicks: [/^Сделки$/, /^(Новая продажа|Оформить продажу|Продажа)$/] },
  { id: "buyout", label: "Новый выкуп", route: "rassrochki", clicks: [/^Выкуп$/] },
  { id: "staff", label: "Новый сотрудник", route: "staff", clicks: [/^Новый сотрудник$/] },
  { id: "finance", label: "Новый расход", route: "finance", clicks: [/^Расход$/, /^Добавить$/] },
  { id: "model", label: "Модели техники", route: "fleet", clicks: [/^Модели$/, /^(Добавить модель|Добавить)$/] },
  { id: "equip", label: "Экипировка", route: "fleet", clicks: [/^Экипировка$/, /^(Добавить позицию|Добавить)$/] },
  { id: "batch", label: "Партия техники", route: "fleet", clicks: [/^Партии$/, /^(Новая партия|Добавить партию|Добавить)$/] },
  { id: "clientcard", label: "Правка клиента", route: "clients", clicks: [/Алексей Смирнов/, /^Изменить$/] },
  { id: "scootercard", label: "Правка техники", route: "fleet", clicks: [/^Jog3Jog/, /^Изменить$/] },
  { id: "rentalpay", label: "Приём оплаты", route: "rentals", clicks: [/Алексей Смирнов/, /^Принять оплату$/] },
  { id: "rentalswap", label: "Замена техники", route: "rentals", clicks: [/Алексей Смирнов/, /^Заменить скутер$/] },
  { id: "rentaldamage", label: "Фиксация ущерба", route: "rentals", clicks: [/Алексей Смирнов/, /^(Зафиксировать ущерб|Ущерб)$/] },
];

export async function run(page, ctx) {
  const vp = process.env.VP ?? "land";
  const want = (process.env.FLOW ?? "all").split(",");
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
      const el = [...document.querySelectorAll("button, [role=button], a, li, tr, div[class*=cursor-pointer]")]
        .filter((x) => {
          const b = x.getBoundingClientRect();
          return b.width > 0 && b.height > 0 && r.test((x.textContent || "").trim());
        })
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      el?.click();
      return el ? (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) : null;
    }, rx.source);

  /** Панель открытого окна: доля экрана, прокрутка, мелкие тач-таргеты. */
  const measure = () =>
    page.evaluate(() => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const overlays = [...document.querySelectorAll("div")].filter((d) => {
        const s = getComputedStyle(d);
        const r = d.getBoundingClientRect();
        return s.position === "fixed" && r.width > W * 0.85 && r.height > H * 0.7 && +s.zIndex >= 30;
      });
      const ov = overlays[overlays.length - 1];
      if (!ov) return { окно: false };
      // Панель = самый крупный прямой потомок оверлея.
      const panel = [...ov.children]
        .map((c) => ({ c, r: c.getBoundingClientRect() }))
        .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0];
      if (!panel) return { окно: false };
      const pr = panel.r;
      const scrollers = [...panel.c.querySelectorAll("*")].filter((e) => {
        const s = getComputedStyle(e);
        return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 6;
      });
      const small = [...panel.c.querySelectorAll("button, input, select, [role=button], [role=switch]")].filter(
        (e) => {
          const r = e.getBoundingClientRect();
          return r.height > 0 && r.height < 44;
        },
      ).length;
      const controls = panel.c.querySelectorAll("button, input, select, textarea, [role=button], [role=switch]").length;
      return {
        окно: true,
        ширинаПанели: Math.round(pr.width),
        доляШирины: Math.round((pr.width / W) * 100),
        высотаПанели: Math.round(pr.height),
        доляВысоты: Math.round((pr.height / H) * 100),
        прокрутка: scrollers.length
          ? scrollers.map((e) => `${e.scrollHeight}/${e.clientHeight}`).join(" ")
          : "нет",
        мелкихТаргетов: `${small} из ${controls}`,
      };
    });

  for (const f of FLOWS) {
    if (want[0] !== "all" && !want.includes(f.id)) continue;
    await ctx.gotoRoute(f.route);
    await ctx.sleep(2400);
    let opened = null;
    for (const rx of f.clicks) {
      opened = await click(rx);
      await ctx.sleep(1600);
    }
    const m = await measure();
    console.log(
      `${f.label.padEnd(20)} кнопка «${opened ?? "—"}» → ` +
        (m.окно
          ? `панель ${m.ширинаПанели}px (${m.доляШирины}% ширины, ${m.доляВысоты}% высоты) · прокрутка ${m.прокрутка} · мелких ${m.мелкихТаргетов}`
          : "окно НЕ открылось"),
    );
    await ctx.shot(`flow-${f.id}-${vp}`, { jpeg: true });
    // закрыть окно перед следующим флоу
    await page.keyboard.press("Escape");
    await ctx.sleep(900);
    await page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .filter((b) => /^(Отмена|Закрыть|Назад)$/.test((b.textContent || "").trim()))
        .slice(0, 1)
        .forEach((b) => b.click());
    });
    await ctx.sleep(700);
  }
}
