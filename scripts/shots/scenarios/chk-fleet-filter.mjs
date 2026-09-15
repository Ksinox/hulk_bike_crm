/** «Скутеры»: окно фильтра моделей не должно прятаться под списком. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1470, height: 1000, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);
  const box = await page.evaluate(() => {
    const b = document.querySelector('button[title^="Фильтр моделей"]');
    if (!b) return null;
    b.click();
    return true;
  });
  await ctx.sleep(800);
  const info = await page.evaluate(() => {
    const head = [...document.querySelectorAll("div")].find((d) => d.textContent?.trim() === "Фильтр по моделям");
    if (!head) return { найдено: false };
    const pop = head.parentElement;
    const r = pop.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height - 12;
    const top = document.elementFromPoint(x, y);
    const chain = [];
    for (let el = pop; el && el !== document.body; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.transform !== "none" || cs.zIndex !== "auto" || cs.overflow !== "visible" || cs.isolation === "isolate" || cs.opacity !== "1")
        chain.push(`${el.tagName}.${String(el.className).slice(0, 60)} z=${cs.zIndex} tr=${cs.transform !== "none"} ov=${cs.overflow} op=${cs.opacity}`);
    }
    return { найдено: true, popRect: [Math.round(r.top), Math.round(r.bottom)], низПоверх: pop.contains(top) ? "окно" : `${top?.tagName}.${String(top?.className).slice(0, 60)}`, предки: chain };
  });
  console.log("фильтр:", box, JSON.stringify(info, null, 1));
  await ctx.shot("fleet-filter", { jpeg: true });
}
