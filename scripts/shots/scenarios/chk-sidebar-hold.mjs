/** Сайдбар не сворачивается при переходе курсора на панель «Ещё». */
export async function run(page, ctx) {
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2600);
  const pos = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    const btns = aside ? [...aside.querySelectorAll("button")] : [];
    const t = btns.find((b) => (b.textContent || "").trim().startsWith("Ещё"));
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  await page.mouse.move(600, 400);
  await ctx.sleep(150);
  if (pos) await page.mouse.move(pos.x, pos.y, { steps: 8 });
  await ctx.sleep(800);

  // Переводим курсор в панель — сайдбар должен остаться раскрытым
  const panelPos = await page.evaluate(() => {
    const panel = [...document.querySelectorAll("div")].find(
      (d) => getComputedStyle(d).position === "fixed" &&
        (d.textContent || "").includes("Ещё разделы"),
    );
    if (!panel) return null;
    const r = panel.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + 60) };
  });
  if (panelPos) await page.mouse.move(panelPos.x, panelPos.y, { steps: 12 });
  await ctx.sleep(700);
  const st = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    const panel = [...document.querySelectorAll("div")].find(
      (d) => getComputedStyle(d).position === "fixed" &&
        (d.textContent || "").includes("Ещё разделы"),
    );
    return {
      asideWidth: aside ? Math.round(aside.getBoundingClientRect().width) : null,
      panelStillOpen: !!panel,
    };
  });
  console.log("курсор на панели:", JSON.stringify(st));
  await ctx.shot("v4-sidebar-hold", { jpeg: true });

  // Увели курсор — всё должно закрыться
  await page.mouse.move(900, 500, { steps: 10 });
  await ctx.sleep(900);
  const after = await page.evaluate(() => ({
    asideWidth: Math.round(document.querySelector("aside").getBoundingClientRect().width),
    panelOpen: [...document.querySelectorAll("div")].some(
      (d) => getComputedStyle(d).position === "fixed" &&
        (d.textContent || "").includes("Ещё разделы"),
    ),
  }));
  console.log("курсор ушёл:", JSON.stringify(after));
}
