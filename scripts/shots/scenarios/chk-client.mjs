/** Карточка клиента на узких экранах. */
export async function run(page, ctx) {
  for (const w of [1100, 900, 820]) {
    await page.setViewport({ width: w, height: 850, deviceScaleFactor: 1 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await ctx.sleep(3200);
    await ctx.gotoRoute("clients");
    await ctx.sleep(2000);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button,tr,div[role=button]")].find(
        (x) => /Смирнов|Козлов|Волков/.test(x.textContent || "") &&
          (x.textContent || "").length < 300,
      );
      (b?.closest("button,tr,[role=button]") ?? b)?.click();
    });
    await ctx.sleep(1800);
    await page.evaluate(() => window.scrollTo(0, 400));
    await new Promise((r) => setTimeout(r, 600));
    const st = await page.evaluate(() => ({
      overflowX:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      // элементы, вылезающие за правый край окна
      spill: [...document.querySelectorAll("main *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 40 && r.right > window.innerWidth + 2;
        })
        .slice(0, 5)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return `${el.tagName}.${String(el.className).slice(0, 45)} right=${Math.round(r.right)}`;
        }),
      head: document.body.innerText.slice(0, 200).split("\n").join(" / "),
    }));
    console.log(`${w}px:`, JSON.stringify(st, null, 1).slice(0, 700));
    await ctx.shot(`chk-client-${w}`, { jpeg: true });
  }
}
