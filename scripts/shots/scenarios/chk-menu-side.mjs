/** Меню «Заявки» не обрезается краем экрана. */
export async function run(page, ctx) {
  const check = async (route, label) => {
    await ctx.gotoRoute(route);
    await ctx.sleep(2400);
    const pos = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        (x.textContent || "").trim().startsWith("Заявки"),
      );
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    if (!pos) return console.log(label, "кнопка не найдена");
    await page.mouse.move(400, 400);
    await ctx.sleep(150);
    await page.mouse.move(pos.x, pos.y, { steps: 8 });
    await ctx.sleep(900);
    const box = await page.evaluate(() => {
      const menu = [...document.querySelectorAll("div")].find(
        (d) =>
          /Открыть список/.test(d.innerText || "") &&
          getComputedStyle(d).position === "absolute",
      );
      if (!menu) return null;
      const r = menu.getBoundingClientRect();
      return {
        left: Math.round(r.left),
        right: Math.round(r.right),
        vw: window.innerWidth,
        fits: r.left >= 0 && r.right <= window.innerWidth,
      };
    });
    console.log(label, JSON.stringify(box));
    await ctx.shot(`chk-menu-${route}`, { jpeg: true });
  };

  await check("sales", "продажи:");
  await check("rentals", "аренды:");
}
