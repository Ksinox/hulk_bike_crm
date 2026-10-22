/**
 * «Сотрудники» → карточка администратора → права (22.10: «Финансы» админу).
 *   [WHO="Администратор"] node scripts/shots/shot.mjs scripts/shots/scenarios/chk-staff-perms.mjs
 */
export async function run(page, ctx) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(7000);
  await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}" });
  await ctx.gotoRoute("staff");
  await ctx.sleep(2500);
  const who = process.env.WHO ?? "Администратор";
  const opened = await page.evaluate((who) => {
    const el = [...document.querySelectorAll("button, [role=button], tr, li, div[class*=cursor-pointer]")]
      .filter((x) => x.getBoundingClientRect().width > 0 && (x.textContent || "").includes(who) && !/Новый сотрудник/.test(x.textContent || ""))
      .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    el?.click();
    return el ? el.textContent.trim().slice(0, 60) : null;
  }, who);
  console.log("открыт:", opened);
  await ctx.sleep(1800);
  const t = await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find((d) => d.children.length === 0 && /Финансы: приход/.test(d.textContent || ""));
    el?.scrollIntoView({ block: "center" });
    return !!el;
  });
  console.log("право финансов на экране:", t);
  await ctx.sleep(600);
  await ctx.shot("staff-perms", { jpeg: true });
}
