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
    const style = document.querySelector("style[data-x]") || null;
    const kf = [...document.querySelectorAll("style")]
      .map((s) => s.textContent || "")
      .filter((t) => /pkWaveA/.test(t))
      .join("|")
      .slice(0, 240);
    return {
      version: window.__APP_VERSION__ ?? null,
      layers: layers.length,
      maskSize: layers[0] ? getComputedStyle(layers[0]).maskSize : null,
      keyframes: kf,
      hasStyleX: !!style,
    };
  });
  console.log(JSON.stringify(info, null, 1));
}
