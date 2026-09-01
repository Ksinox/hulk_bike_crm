/** Кто вылезает за правый край на 1150px. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1150, height: 820, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  console.log(
    await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const out = [];
      document.querySelectorAll("*").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 8 && r.right > w + 0.5) {
          out.push({
            tag: el.tagName,
            cls: String(el.className).slice(0, 70),
            right: Math.round(r.right),
            w: Math.round(r.width),
            text: (el.textContent || "").trim().slice(0, 30),
          });
        }
      });
      return { clientWidth: w, scrollWidth: document.documentElement.scrollWidth, out: out.slice(0, 12) };
    }),
  );
  await ctx.shot("chk-spill-1150", { jpeg: true });
}
