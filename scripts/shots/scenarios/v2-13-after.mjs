/** П.13: сколько контента влезает на 1280×720 после компактного режима. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  for (const [route, shot] of [
    ["dashboard", "v2-13-small-dashboard"],
    ["fleet", "v2-13-small-fleet"],
  ]) {
    await ctx.gotoRoute(route);
    await ctx.sleep(2200);
    const st = await page.evaluate(() => {
      const h1 = document.querySelector("main h1");
      const vis = [...document.querySelectorAll("main section, main > div")].filter(
        (el) => {
          const r = el.getBoundingClientRect();
          return r.top < window.innerHeight && r.bottom > 0 && r.height > 30;
        },
      ).length;
      return {
        h1: h1 ? getComputedStyle(h1).fontSize : null,
        visibleBlocks: vis,
        pageHeight: document.documentElement.scrollHeight,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    console.log(route, JSON.stringify(st));
    await ctx.shot(shot, { jpeg: true });
  }
}
