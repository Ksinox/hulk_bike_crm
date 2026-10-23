/**
 * 2.1: кадры «Смешанно» в карточке аренды — пополнение залога, паркинг,
 * доплата за экипировку. Ничего не сохраняет (окна закрываются без отправки).
 *   SHOT=topup|parking|equip VP=desk|phone RENTAL=29 WHO="Иван Иванов" \
 *   node scripts/shots/shot.mjs scripts/shots/scenarios/b5-mixed.mjs
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const vp = process.env.VP ?? "desk";
  const what = process.env.SHOT ?? "topup";
  const rentalId = Number(process.env.RENTAL ?? 29);
  const who = process.env.WHO ?? "Иван Иванов";
  if (vp === "phone") {
    await page.setUserAgent(PHONE_UA);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  } else {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  }
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
  });
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
  const click = (src, sel = "button, a, [role=button], [title]") =>
    page.evaluate(
      (src, sel) => {
        const r = new RegExp(src);
        const el = [...document.querySelectorAll(sel)]
          .filter((x) => {
            const b = x.getBoundingClientRect();
            const t = ((x.textContent || "").trim() + " " + (x.getAttribute("title") || "")).trim();
            return b.width > 0 && b.height > 0 && r.test(t);
          })
          .pop();
        el?.click();
        return el ? ((el.textContent || "").trim() || el.getAttribute("title") || "").slice(0, 50) : null;
      },
      src,
      sel,
    );

  await ctx.gotoRoute("rentals", { rentalId });
  await ctx.sleep(3500);
  await page.evaluate((who) => {
    const el = [...document.querySelectorAll("td, div, span")]
      .filter((x) => x.childElementCount === 0 && x.textContent?.trim().startsWith(who))
      .find((x) => x.getBoundingClientRect().width > 0);
    (el?.closest("tr, [role=row], button, a") ?? el)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, who);
  await ctx.sleep(4000);

  if (what === "topup") {
    console.log("залог:", await click("^Залог неполный"));
  } else if (what === "parking") {
    console.log("меню:", await click("^(Ещё|Действия|⋯|…)$"));
    await ctx.sleep(800);
    console.log("паркинг:", await click("Поставить на паркинг"));
  } else if (what === "equip") {
    console.log("экипировка:", await click("^(Изменить|Изменить экипировку|Сменить)$"));
  }
  await ctx.sleep(1500);
  console.log("смешанно:", await click("^Смешанно$", "button"));
  await ctx.sleep(900);
  await ctx.shot(`b5-${what}-${vp}`, { jpeg: true });
}
