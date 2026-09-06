/** Проверка пунктов 2.32/2.33 на «Развитии»: текст, кадры грузятся, вёрстка. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  await ctx.gotoRoute("progress");
  await ctx.sleep(3000);
  const info = await page.evaluate(async () => {
    const t = document.body.innerText;
    const imgs = [...document.querySelectorAll("img")].filter((i) => /\/progress\/v8-|\/progress\/v7-/.test(i.getAttribute("src") || ""));
    const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute("src"));
    return {
      п233: /Партия правок 06\.09 \(вторая\)/.test(t),
      п232: /Партия правок 06\.09: журнал техники/.test(t),
      кадровV8: imgs.filter((i) => /v8-/.test(i.getAttribute("src") || "")).length,
      битых: broken,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log("развитие:", JSON.stringify(info));
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("h2, h3, div")].find((d) => /Партия правок 06\.09 \(вторая\)/.test(d.textContent || "") && (d.textContent || "").length < 200);
    el?.scrollIntoView({ block: "start" });
  });
  await ctx.sleep(800);
  await ctx.shot("v8-landing-233", { jpeg: true });
}
