/** Экран-стена и доска должны помещаться в монитор любого размера. */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  const sizes = [
    ["1280x720", 1280, 720],
    ["1920x1080", 1920, 1080],
    ["2560x1440", 2560, 1440],
    ["1024x768", 1024, 768],
  ];

  for (const [name, w, h] of sizes) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.goto(ctx.base + "/?screen=analytics-wall", { waitUntil: "domcontentloaded" });
    await ctx.sleep(5200);
    const fit = await page.evaluate(() => {
      const d = document.documentElement;
      const grid = [...document.querySelectorAll("div")].find((x) =>
        (x.style.gridTemplateRows || "").startsWith("repeat("),
      );
      const tiles = [...document.querySelectorAll("[data-flip-key]")];
      const gr = grid?.getBoundingClientRect();
      let out = 0;
      for (const t of tiles) {
        const r = t.getBoundingClientRect();
        if (gr && (r.bottom > gr.bottom + 1 || r.right > gr.right + 1)) out++;
      }
      return {
        прокрутка: {
          y: d.scrollHeight - d.clientHeight,
          x: d.scrollWidth - d.clientWidth,
        },
        плиток: tiles.length,
        вылезло: out,
        колонок: (grid?.style.gridTemplateColumns || "").match(/repeat\((\d+)/)?.[1] ?? null,
        рядов: (grid?.style.gridTemplateRows || "").match(/repeat\((\d+)/)?.[1] ?? null,
        цифра: (() => {
          const el = document.querySelector("[data-flip-key] .font-display");
          return el ? getComputedStyle(el).fontSize : null;
        })(),
      };
    });
    console.log(name + ":", JSON.stringify(fit));
    await S(`fit-wall-${name}`);
  }

  /* доска в CRM */
  for (const [name, w, h] of [["board-1440", 1440, 900], ["board-1024", 1024, 768]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(4500);
    await page.evaluate(() => {
      [...document.querySelectorAll("button")].find((b) => /^Позже$/.test((b.textContent || "").trim()))?.click();
    });
    await ctx.sleep(600);
    await ctx.gotoRoute("analytics");
    await ctx.sleep(3800);
    console.log(name + ":", JSON.stringify(await page.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      плиток: document.querySelectorAll("[data-flip-key]").length,
    }))));
    await S(`fit-${name}`);
  }
}
