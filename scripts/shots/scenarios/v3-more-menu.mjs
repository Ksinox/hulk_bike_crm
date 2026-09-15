/** Кадр: меню «Ещё» со скрытыми разделами (маленький экран). */
export async function run(page, ctx) {
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2800);
  const pos = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    const btns = aside ? [...aside.querySelectorAll("button")] : [];
    const t = btns.find((b) => (b.textContent || "").trim().startsWith("Ещё"));
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  console.log("кнопка «Ещё»:", JSON.stringify(pos));
  await page.mouse.move(600, 400);
  await ctx.sleep(150);
  if (pos) await page.mouse.move(pos.x, pos.y, { steps: 10 });
  await ctx.sleep(1000);
  const st = await page.evaluate(() => {
    const panel = [...document.querySelectorAll("div")].find(
      (d) => getComputedStyle(d).position === "fixed" &&
        (d.textContent || "").includes("Ещё разделы"),
    );
    return {
      open: !!panel,
      items: panel
        ? [...panel.querySelectorAll("button")].map((b) => (b.textContent || "").trim())
        : [],
    };
  });
  console.log("панель:", JSON.stringify(st));
  await ctx.shot("v3-sidebar-more", { jpeg: true });
}
