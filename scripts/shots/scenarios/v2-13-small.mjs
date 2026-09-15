/** Правки 2.0, п.13: аудит на маленьком ноутбуке (1280×720, 1366×768). */
export async function run(page, ctx) {
  const routes = ["dashboard", "rentals", "fleet", "clients", "partners"];
  for (const [w, h] of [
    [1280, 720],
    [1366, 768],
  ]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    for (const route of routes) {
      await ctx.gotoRoute(route);
      await ctx.sleep(2000);
      const over = await page.evaluate(() => {
        const doc = document.documentElement;
        const overflowX = doc.scrollWidth - doc.clientWidth;
        // элементы, вылезающие за правый край окна
        const bad = [];
        document.querySelectorAll("main *").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > window.innerWidth + 2) {
            bad.push({
              tag: el.tagName.toLowerCase(),
              cls: (el.className || "").toString().slice(0, 60),
              over: Math.round(r.right - window.innerWidth),
            });
          }
        });
        return { overflowX, bad: bad.slice(0, 4), badCount: bad.length };
      });
      console.log(`${w}x${h} ${route}:`, JSON.stringify(over));
    }
    await ctx.gotoRoute("dashboard");
    await ctx.sleep(1600);
    await ctx.shot(`chk-small-${w}`, { jpeg: true });
  }
}
