/** Проверка кэш-бастера: кадры «Развития» грузятся с ?v=<билд>. */
export async function run(page, ctx) {
  await ctx.gotoRoute("progress");
  await ctx.sleep(2500);
  // Раскрыть пункт 2.4, чтобы в DOM появились его картинки
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /Два чипса загрузки/.test(b.textContent || ""),
    );
    btn?.click();
  });
  await ctx.sleep(1200);
  const info = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")]
      .map((i) => i.getAttribute("src") || "")
      .filter((s) => s.includes("/progress/"));
    return {
      total: imgs.length,
      withV: imgs.filter((s) => s.includes("?v=")).length,
      sample: imgs.find((s) => s.includes("v2-4-gauges-mobile")) ?? imgs[0] ?? null,
    };
  });
  console.log(JSON.stringify(info));
}
