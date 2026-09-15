/** Диагностика: какой уровень маски у залитого на 100% круга. */
export async function run(page, ctx) {
  await page.setCacheEnabled(false);
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(3000);
  const info = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) =>
        /Электротранспорт/.test(b.textContent || "") &&
        /в\sаренде/.test(b.textContent || ""),
    );
    if (!btn) return null;
    const circle = btn.querySelector("div.rounded-full");
    const layers = [...circle.children].filter(
      (c) => c.tagName === "DIV" && getComputedStyle(c).maskImage !== "none",
    );
    const own = circle.querySelector("style");
    const cs = getComputedStyle(layers[0]);
    return {
      layers: layers.length,
      animName: cs.animationName,
      maskSize: cs.maskSize,
      ownKeyframes: (own && own.textContent ? own.textContent : "").slice(0, 170),
    };
  });
  console.log(JSON.stringify(info, null, 1));
}
