/** Проверка: история пункта 1 на лендинге (раскрыть, кадр). */
export async function run(page, ctx) {
  await ctx.gotoRoute("progress");
  await ctx.sleep(1500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Ключ директора/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(2500);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find(
      (e) => (e.textContent || "").trim().startsWith("Менеджер удаляет аренду"),
    );
    el?.scrollIntoView({ block: "start" });
    window.scrollBy(0, -110);
  });
  await ctx.sleep(2000);
  await ctx.shot("landing-item1");
}
