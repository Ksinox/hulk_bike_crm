/**
 * Показ обновления 2.0 на превью (запуск с SHOT_TOUR=1). Кадры — в
 * public/progress (идут в «Развитие»).
 *   Телефон: титул → карточка → «было/стало» → «Посмотрю позже».
 *   Компьютер: «Продолжить знакомство» → «Показать где» → подсказка у меню →
 *   раздел → подсказка у кнопки → досмотр до «Готово» → «Кто посмотрел».
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  const click = (re, sel = "button") =>
    page.evaluate(
      (src, sel) => {
        const rx = new RegExp(src);
        const els = [...document.querySelectorAll(sel)].filter((x) => {
          const r = x.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && rx.test((x.textContent || "").trim());
        });
        const el = els.sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.click();
        return el ? (el.textContent || "").trim().slice(0, 40) : null;
      },
      re.source,
      sel,
    );
  const state = () =>
    page.evaluate(() => ({
      титул: !!document.querySelector(".rt-intro"),
      карточка: document.querySelector(".rt-card-title")?.textContent ?? null,
      счёт: document.querySelector(".rt-count")?.textContent ?? null,
      подсказка: document.querySelector(".rt-pop-title")?.textContent ?? null,
      пятно: !!document.querySelector(".rt-spot"),
      продолжить: !!document.querySelector(".rt-resume"),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
  const api = ctx.base.replace("crm-", "api-");
  const me = () =>
    page.evaluate(async (api) => {
      const r = await fetch(api + "/api/releases/me", { credentials: "include" });
      return r.ok ? (await r.json()).views : `HTTP ${r.status}`;
    }, api);

  /* ---------- телефон ---------- */
  await page.setUserAgent(PHONE_UA);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  console.log("телефон, вход:", JSON.stringify(await state()), JSON.stringify(await me()));
  await S("tour-m-01-intro");
  await click(/^Смотреть, что нового$/);
  await ctx.sleep(1500);
  console.log("телефон, карточка:", JSON.stringify(await state()));
  await S("tour-m-02-card");
  await click(/^Посмотрю позже$/);
  await ctx.sleep(800);
  console.log("телефон, отложил:", JSON.stringify(await state()), JSON.stringify(await me()));
  await S("tour-m-04-later");

  /* ---------- компьютер ---------- */
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  );
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6000);
  console.log("компьютер, вход после «позже»:", JSON.stringify(await state()));
  await S("tour-d-01-first-hint");
  // первая подсказка на главной — «Поиск»
  if ((await state()).подсказка) {
    await click(/^Понятно$/);
    await ctx.sleep(800);
  }
  console.log("компьютер, после подсказки:", JSON.stringify(await state()));
  await S("tour-d-01-resume");
  await click(/^Продолжить знакомство/);
  await ctx.sleep(1200);
  console.log("компьютер, карточка:", JSON.stringify(await state()));
  await S("tour-d-02-card");
  await click(/^Показать где$/);
  await ctx.sleep(1500);
  console.log("компьютер, где найти:", JSON.stringify(await state()));
  await S("tour-d-03-where");
  await click(/^Открыть$/);
  await ctx.sleep(2500);
  console.log("компьютер, в разделе:", JSON.stringify(await state()));
  await S("tour-d-04-hint");
  await click(/^Понятно$/);
  await ctx.sleep(800);
  await click(/^Продолжить знакомство/);
  await ctx.sleep(1000);
  for (let i = 0; i < 8; i++) {
    const st = await state();
    if (!st.карточка) break;
    if (st.карточка === "Ремонты") await S("tour-d-05-before-after");
    await click(/^(Дальше|Готово)$/);
    await ctx.sleep(700);
  }
  console.log("компьютер, досмотрел:", JSON.stringify(await state()), JSON.stringify(await me()));

  await ctx.gotoRoute("staff");
  await ctx.sleep(2500);
  await S("tour-d-06-who");
  console.log("кто посмотрел:", await page.evaluate(() => (document.body.innerText.match(/Обновление 2\.0: кто посмотрел[\s\S]{0,200}/) || [""])[0].replace(/\s+/g, " ")));
}
