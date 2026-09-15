/** 15.09, превью: общий поиск в шапке находит скутер по номеру. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1470, height: 1000, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  for (const t of ["7", "№6", "джог 7", "бывший 2"]) {
    const box = await page.evaluate(() => {
      const i = document.querySelector('input[placeholder^="Поиск: клиент"]');
      const r = i.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(box.x, box.y);
    await page.keyboard.down("Control");
    await page.keyboard.press("KeyA");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await page.keyboard.type(t, { delay: 40 });
    await ctx.sleep(1500);
    const hits = await page.evaluate(() => {
      const i = document.querySelector('input[placeholder^="Поиск: клиент"]');
      const panel = i.closest("div")?.parentElement?.parentElement;
      const txt = (panel?.innerText || "").replace(/\s+/g, " ");
      return { value: i.value, dropdown: txt.slice(0, 220) };
    });
    console.log(`«${t}»:`, JSON.stringify(hits));
    await ctx.shot(`gn-${["7", "№6", "джог 7", "бывший 2"].indexOf(t)}`, { jpeg: true });
  }
}
