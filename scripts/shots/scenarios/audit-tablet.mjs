/**
 * Инвентаризация планшетной вёрстки (21.09).
 *
 * Ходит по всем разделам на планшете и меряет, что именно «по-телефонному»:
 *   • какую долю ширины экрана реально занимает контент (колонка 960px на
 *     1180px — это 81%, но по факту карточки внутри ещё уже);
 *   • нужна ли прокрутка и насколько длинная;
 *   • в одну ли колонку идут карточки списка;
 *   • сколько пустого места справа и слева.
 *
 *   VP=land|port node scripts/shots/shot.mjs scripts/shots/scenarios/audit-tablet.mjs
 * Кадры — scripts/shots/out/aud-<route>-<vp>.jpg
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

const ROUTES = [
  ["dashboard", "Главная"],
  ["rentals", "Аренды"],
  ["clients", "Клиенты"],
  ["fleet", "Скутеры"],
  ["service", "Ремонты"],
  ["debtors", "Должники"],
  ["sales", "Продажи"],
  ["rassrochki", "Выкуп"],
  ["partners", "Партнёрка"],
  ["finance", "Финансы"],
  ["docs", "Документы"],
  ["analytics", "Аналитика"],
  ["staff", "Сотрудники"],
  ["progress", "Развитие"],
  ["settings", "Настройки"],
];

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

  const measure = () =>
    page.evaluate(() => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      // Карточки раздела: широкие блоки со скруглением.
      const cards = [...document.querySelectorAll("div,section,li,article")].filter((el) => {
        const c = (el.className || "").toString();
        const r = el.getBoundingClientRect();
        return /rounded-(2xl|3xl|xl)/.test(c) && r.width > 180 && r.height > 40 && r.top < 2000;
      });
      const widest = cards.reduce((m, el) => Math.max(m, el.getBoundingClientRect().width), 0);
      // Сколько карточек стоят рядом в одной строке (проверка колоночности).
      const rows = new Map();
      for (const el of cards) {
        const r = el.getBoundingClientRect();
        if (r.width < 200) continue;
        const key = Math.round(r.top / 24);
        rows.set(key, (rows.get(key) ?? 0) + 1);
      }
      const maxInRow = Math.max(0, ...rows.values());
      const scroller =
        [...document.querySelectorAll("div")].find((d) =>
          /overflow-y-auto/.test((d.className || "").toString()),
        ) ?? document.scrollingElement;
      const sh = scroller ? scroller.scrollHeight : document.body.scrollHeight;
      const ch = scroller ? scroller.clientHeight : H;
      // Пустые поля по краям: где начинается и заканчивается самый широкий блок.
      const target = cards.find((el) => el.getBoundingClientRect().width === widest);
      const box = target ? target.getBoundingClientRect() : null;
      return {
        ширина: W,
        доляШирины: widest ? Math.round((widest / W) * 100) : 0,
        полеСлева: box ? Math.round(box.left) : null,
        полеСправа: box ? Math.round(W - box.right) : null,
        вРядуКарточек: maxInRow,
        прокрутка: sh > ch + 4 ? `${sh}/${ch}` : "нет",
        карточек: cards.length,
      };
    });

  const out = [];
  for (const [route, label] of ROUTES) {
    await ctx.gotoRoute(route);
    await ctx.sleep(2600);
    const m = await measure();
    out.push({ раздел: label, ...m });
    console.log(
      `${label.padEnd(12)} ширина ${String(m.доляШирины).padStart(3)}% · поля ${m.полеСлева}/${m.полеСправа} · в ряду ${m.вРядуКарточек} · прокрутка ${m.прокрутка}`,
    );
    await ctx.shot(`aud-${route}-${vp}`, { jpeg: true });
  }
  const bad = out.filter((r) => r.доляШирины < 88 || r.вРядуКарточек < 2);
  console.log(`\nтребуют планшетной раскладки: ${bad.length} из ${out.length}`);
  console.log(bad.map((b) => b.раздел).join(", "));
}
