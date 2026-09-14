/** «Было» для пунктов про личные аккаунты (14.09): снимается с превью до выкладки. */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  const dismiss = () =>
    page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => /^Позже$/.test((b.textContent || "").trim()))
        ?.click();
    });

  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5500);
  await dismiss();

  await ctx.gotoRoute("staff");
  await ctx.sleep(3000);
  await dismiss();
  await S("acc-was-01-staff");

  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Добавить сотрудника/.test(b.textContent || ""))
      ?.click();
  });
  await ctx.sleep(1500);
  await S("acc-was-02-add");
  await page.keyboard.press("Escape");
  await ctx.sleep(600);

  await ctx.gotoRoute("sales");
  await ctx.sleep(3500);
  await S("acc-was-03-sales");

  await ctx.gotoRoute("service");
  await ctx.sleep(3200);
  await S("acc-was-04-service");
}
