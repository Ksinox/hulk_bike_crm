/**
 * Кадры партии 23.10 («ущерб — в «Должниках»») — одним сценарием со старого
 * кода («было», TAG=was) и с нового (TAG=now). Ничего не сохраняет.
 *   SHOT=rentals|rental|dash|debtors|case|wizard|act VP=desk|phone|land TAG=was|now \
 *   RENTAL=32 CASE=15 node scripts/shots/shot.mjs scripts/shots/scenarios/b4-frames.mjs
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const vp = process.env.VP ?? "desk";
  const tag = process.env.TAG ?? "now";
  const what = process.env.SHOT ?? "rental";
  const rentalId = Number(process.env.RENTAL ?? 32);
  const caseId = Number(process.env.CASE ?? 15);
  const who = process.env.WHO ?? "Роман Новиков";
  const openRental = async () => {
    await ctx.gotoRoute("rentals", { rentalId });
    await ctx.sleep(3500);
    await page.evaluate((who) => {
      const el = [...document.querySelectorAll("td, div, span")]
        .filter((x) => x.childElementCount === 0 && x.textContent?.trim().startsWith(who))
        .find((x) => x.getBoundingClientRect().width > 0);
      (el?.closest("tr, [role=row], button, a") ?? el)?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    }, who);
    await ctx.sleep(4000);
  };
  if (vp !== "desk") {
    await page.setUserAgent(vp === "phone" ? PHONE_UA : IPAD_UA);
    await page.setViewport(
      vp === "phone"
        ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    );
  } else {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  }
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
  });
  // всплывающие заявки/подсказки — закрыть
  await page.evaluate(async () => {
    for (let i = 0; i < 12; i++) {
      const b = [...document.querySelectorAll("button")].find(
        (x) => x.getAttribute("aria-label") === "Закрыть" || x.textContent.trim() === "Закрыть",
      );
      if (!b) break;
      b.click();
      await new Promise((r) => setTimeout(r, 300));
    }
  });
  const click = (src) =>
    page.evaluate((src) => {
      const r = new RegExp(src);
      const el = [...document.querySelectorAll("button, a, [role=button]")]
        .filter((x) => {
          const b = x.getBoundingClientRect();
          return b.width > 0 && b.height > 0 && r.test((x.textContent || "").trim());
        })
        .pop();
      el?.click();
      return el ? (el.textContent || "").trim().slice(0, 40) : null;
    }, src);

  if (what === "rentals") {
    await ctx.gotoRoute("rentals");
    await ctx.sleep(3000);
    console.log("скрыть:", await click("^Скрыть$"));
    await ctx.sleep(1200);
    await ctx.shot(`b4-rentals-${vp}-${tag}`, { jpeg: true });
  }
  if (what === "rental") {
    await openRental();
    await ctx.shot(`b4-rental-${vp}-${tag}`, { jpeg: true });
  }
  if (what === "dash") {
    await ctx.gotoRoute("dashboard");
    await ctx.sleep(4000);
    await page.evaluate(() => {
      const h = [...document.querySelectorAll("h3")].find((x) => x.textContent?.includes("Долги к сбору"));
      h?.scrollIntoView({ block: "start" });
      window.scrollBy(0, -80);
    });
    await ctx.sleep(800);
    await ctx.shot(`b4-dash-${vp}-${tag}`, { jpeg: true });
  }
  if (what === "debtors") {
    await ctx.gotoRoute("debtors");
    await ctx.sleep(4500);
    await ctx.shot(`b4-debtors-${vp}-${tag}`, { jpeg: true });
  }
  if (what === "case") {
    await ctx.gotoRoute("debtors", { debtorId: caseId });
    await ctx.sleep(4500);
    // телефон: если открылась главная — тапнуть строку дела
    const row = process.env.ROW;
    if (row)
      await page.evaluate((row) => {
        document.querySelector(`[data-case-row="${row}"]`)?.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      }, row);
    await ctx.sleep(3000);
    await ctx.shot(`b4-case-${vp}-${tag}`, { jpeg: true });
  }
  if (what === "check") {
    // «Пришла ли оплата?» → «Частично»
    await ctx.gotoRoute("debtors", { debtorId: caseId });
    await ctx.sleep(4500);
    await page.evaluate((row) => {
      document.querySelector(`[data-case-row="${row}"]`)?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    }, process.env.ROW ?? "D-014");
    await ctx.sleep(3000);
    console.log("частично:", await click("^Частично$"));
    await ctx.sleep(800);
    await ctx.shot(`b4-check-${vp}-${tag}`, { jpeg: true });
  }
  if (what === "complete") {
    await openRental();
    console.log("закрыть:", await click("^Закрыть аренду$"));
    await ctx.sleep(2500);
    await ctx.shot(`b4-complete-${vp}-${tag}`, { jpeg: true });
  }
  if (what === "act") {
    await openRental();
    console.log(
      "меню:",
      await page.evaluate(() => {
        // «⋯» — последняя кнопка в шапке карточки (рядом со «Скрыть»)
        const hide = [...document.querySelectorAll("button")].find(
          (x) => x.textContent?.trim() === "Скрыть" && x.getBoundingClientRect().width > 0,
        );
        let row = hide?.parentElement;
        while (row && row.querySelectorAll("button").length < 2) row = row.parentElement;
        const bs = row ? [...row.querySelectorAll("button")] : [];
        const b = bs[bs.length - 1];
        b?.click();
        return !!b;
      }),
    );
    await ctx.sleep(700);
    console.log("акт:", await click("(Зафиксировать|Изменить) ущерб"));
    await ctx.sleep(1500);
    // выбрать первую позицию прайса, чтобы появился долг и «Срок оплаты»
    await page.evaluate(() => {
      const it = [...document.querySelectorAll("button")]
        .filter((x) => x.getBoundingClientRect().width > 0)
        .find((x) => /\d[\d\s]*₽/.test(x.textContent || "") && x.closest("[role=dialog], .fixed"));
      it?.click();
    });
    await ctx.sleep(2500);
    await ctx.shot(`b4-act-${vp}-${tag}`, { jpeg: true });
  }
  if (what === "wizard") {
    await ctx.gotoRoute("debtors");
    await ctx.sleep(4000);
    console.log("новое дело:", await click("Новое дело$"));
    await ctx.sleep(1500);
    // шаг 1: клиент из базы → шаг 2: тип → шаг 3: сумма и комментарий
    await page.type("input[placeholder^='Поиск по ФИО']", process.env.WHO ?? "Роман Новиков", { delay: 30 });
    await ctx.sleep(1500);
    console.log("клиент:", await click(process.env.WHO ?? "Роман Новиков"));
    await ctx.sleep(600);
    console.log("далее:", await click("^Далее"));
    await ctx.sleep(900);
    console.log("тип:", await click("^Ущерб"));
    await ctx.sleep(600);
    console.log("далее:", await click("^Далее"));
    await ctx.sleep(1200);
    await ctx.shot(`b4-wizard-${vp}-${tag}`, { jpeg: true });
  }
}
