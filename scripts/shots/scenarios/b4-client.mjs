/** Карточка клиента с делом ущерба (партия 23.10). CLIENT=<id> VP=desk|phone */
export async function run(page, ctx) {
  const vp = process.env.VP ?? "desk";
  if (vp === "phone")
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
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
  await ctx.gotoRoute("clients", { clientId: Number(process.env.CLIENT) });
  await ctx.sleep(1500);
  await ctx.gotoRoute("clients", { clientId: Number(process.env.CLIENT) });
  await ctx.sleep(2500);
  await page.evaluate((who) => {
    const el = [...document.querySelectorAll("div, span, td")]
      .filter((x) => x.childElementCount === 0 && x.textContent?.trim() === who)
      .find((x) => x.getBoundingClientRect().width > 0);
    el?.scrollIntoView({ block: "center" });
    (el?.closest("button, a, [role=button], tr") ?? el)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, process.env.WHO ?? "Роман Новиков");
  await ctx.sleep(5000);
  console.log(await page.evaluate(() => document.body.innerText.match(/.{0,60}(Должник|долг|Долг|D-0\d\d).{0,60}/g)?.slice(0, 12).join("\n")));
  await ctx.shot(`b4-client-${vp}`, { jpeg: true });
}
