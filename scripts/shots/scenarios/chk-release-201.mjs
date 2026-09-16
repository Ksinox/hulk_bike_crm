/**
 * Показ выпуска 2.0.1 на превью (SHOT_TOUR=1, прогресс shotbot готовят
 * перед запуском). PHASE:
 *   desk  — 2.0 уже просмотрен: сразу слайды 2.0.1, «Готово», подсказка
 *           у «Добавить скутер»;
 *   phone — те же слайды на телефоне, «Посмотрю позже», «Продолжить»;
 *   chain — ничего не смотрел: титул 2.0 → слайды 2.0 → следом 2.0.1.
 * Кадры — в public/progress (идут в «Развитие»).
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
      титул: document.querySelector(".rt-title")?.textContent ?? null,
      бренд: document.querySelector(".rt-brand")?.textContent?.trim() ?? null,
      карточка: document.querySelector(".rt-card-title")?.textContent ?? null,
      зачем: !!document.querySelector(".rt-why"),
      сравнение: !!document.querySelector(".rt-ba"),
      счёт: document.querySelector(".rt-count")?.textContent ?? null,
      подсказка: document.querySelector(".rt-pop-title")?.textContent ?? null,
      продолжить: document.querySelector(".rt-resume")?.textContent ?? null,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
  const api = ctx.base.replace("crm-", "api-");
  const me = () =>
    page.evaluate(async (api) => {
      const r = await fetch(api + "/api/releases/me", { credentials: "include" });
      return r.ok
        ? (await r.json()).views.map((v) => `${v.version}:${v.status}:${v.cardsSeen}:${v.postponedCount}`).join(" ")
        : `HTTP ${r.status}`;
    }, api);
  const phase = process.env.PHASE ?? "desk";

  if (phase === "desk") {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(6500);
    console.log("вход:", JSON.stringify(await state()), await me());
    await ctx.sleep(2500);
    await S("tour201-d-1");
    for (let i = 2; i <= 5; i++) {
      await click(/^Дальше$/);
      await ctx.sleep(3000);
      console.log(`карточка ${i}:`, JSON.stringify(await state()));
      await S(`tour201-d-${i}`);
    }
    console.log("готово:", await click(/^Готово$/));
    await ctx.sleep(1200);
    console.log("после:", JSON.stringify(await state()), await me());
    await ctx.gotoRoute("fleet");
    await ctx.sleep(2500);
    console.log("скутеры:", JSON.stringify(await state()));
    await S("tour201-d-hint");
    console.log("понятно:", await click(/^Понятно$/));
    await ctx.sleep(800);
    console.log("прогресс:", await me());
  }

  if (phase === "phone") {
    await page.setUserAgent(PHONE_UA);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(6500);
    await ctx.sleep(2500);
    console.log("телефон, вход:", JSON.stringify(await state()), await me());
    await S("tour201-m-1");
    for (let i = 2; i <= 4; i++) {
      await click(/^Дальше$/);
      await ctx.sleep(3000);
      console.log(`телефон, ${i}:`, JSON.stringify(await state()));
      await S(`tour201-m-${i}`);
    }
    console.log("позже:", await click(/^Посмотрю позже$/));
    await ctx.sleep(1000);
    console.log("телефон, отложил:", JSON.stringify(await state()), await me());
    await S("tour201-m-later");
    // после обновления страницы в той же вкладке показ не лезет сам
    await page.reload({ waitUntil: "domcontentloaded" });
    await ctx.sleep(7000);
    console.log("телефон, перезагрузка:", JSON.stringify(await state()));
    console.log("продолжить:", await click(/^Продолжить знакомство/));
    await ctx.sleep(1500);
    console.log("телефон, продолжил:", JSON.stringify(await state()));
  }

  if (phase === "chain") {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(6500);
    console.log("вход:", JSON.stringify(await state()), await me());
    console.log("смотреть:", await click(/^Смотреть, что нового$/));
    await ctx.sleep(1500);
    let guard = 0;
    while (guard++ < 12) {
      const st = await state();
      if (!st.карточка) break;
      if (/2\.0\.1/.test(st.бренд ?? "")) {
        console.log("следом 2.0.1:", JSON.stringify(st));
        await S("tour201-chain");
        break;
      }
      await click(/^(Дальше|Готово)$/);
      await ctx.sleep(900);
    }
    console.log("прогресс:", await me());
  }
}
