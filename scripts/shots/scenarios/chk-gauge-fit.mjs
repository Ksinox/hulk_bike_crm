/** Не вылезает ли подпись чипса за карточку на узком/низком экране. */
export async function run(page, ctx) {
  for (const [w, h] of [
    [1280, 720],
    [1366, 768],
    [1440, 900],
  ]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await ctx.gotoRoute("dashboard");
    await ctx.sleep(2600);
    const res = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(
        (b) =>
          /Электротранспорт/.test(b.textContent || "") &&
          /в\sаренде/.test(b.textContent || ""),
      );
      if (!btn) return null;
      const card = btn.closest("div");
      const rc = card.getBoundingClientRect();
      const label = [...btn.querySelectorAll("div")].find((d) =>
        /^\s*Электротранспорт\s*$/.test(d.textContent || ""),
      );
      const rl = label ? label.getBoundingClientRect() : null;
      return {
        cardRight: Math.round(rc.right),
        labelRight: rl ? Math.round(rl.right) : null,
        slack: rl ? Math.round(rc.right - rl.right) : null,
        scrollW: btn.scrollWidth,
        clientW: btn.clientWidth,
      };
    });
    console.log(`${w}x${h}:`, JSON.stringify(res));
  }
}
