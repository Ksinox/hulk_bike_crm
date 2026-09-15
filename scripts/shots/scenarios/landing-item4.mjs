/** Проверка: история пункта 4 на лендинге (раскрыть, кадр, картинки). */
export async function run(page, ctx) {
  await ctx.gotoRoute("progress");
  await ctx.sleep(1500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Обязательная причина возврата/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(2500);
  const imgs = await page.evaluate(() => {
    const list = [...document.querySelectorAll("img")]
      .filter((i) => /\/progress\/p4-/.test(i.src))
      .map((i) => ({ src: i.src.split("/").pop(), ok: i.naturalWidth > 0 }));
    return list;
  });
  console.log("p4 imgs:", JSON.stringify(imgs));
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find(
      (e) => (e.textContent || "").trim().startsWith("Закрываем аренду №0035"),
    );
    el?.scrollIntoView({ block: "start" });
    window.scrollBy(0, -110);
  });
  await ctx.sleep(2000);
  await ctx.shot("landing-item4");
}
