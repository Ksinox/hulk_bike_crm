/** Проверка 28.08: «Ещё» в сайдбаре + списки без горизонтального скролла. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2600);

  const nav = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    const btns = aside ? [...aside.querySelectorAll("button")] : [];
    const more = btns.find((b) => /Ещё/.test(b.textContent || "") || (b.textContent || "").trim().startsWith("Ещё"));
    return {
      visibleRows: btns.length,
      hasMore: !!more,
      asideScrollable: aside ? aside.scrollHeight > aside.clientHeight + 2 : null,
    };
  });
  console.log("сайдбар:", JSON.stringify(nav));

  // Открыть «Ещё» наведением
  // Реальное наведение курсором: React слушает mouseover, синтетический
  // mouseenter его не запускает.
  const box = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    const btns = aside ? [...aside.querySelectorAll("button")] : [];
    const target = btns.find((b) => (b.textContent || "").trim().startsWith("Ещё"));
    if (!target) return null;
    const r = target.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (box) {
    await page.mouse.move(600, 400);
    await ctx.sleep(120);
    await page.mouse.move(box.x, box.y, { steps: 8 });

  }
  await ctx.sleep(900);
  const panel = await page.evaluate(() => ({
    open: /Ещё разделы/.test(document.body.innerText),
    items: (document.body.innerText.match(/Ещё разделы([\s\S]{0,300})/) || [])[1]?.split("\n").filter(Boolean).slice(0, 8) ?? [],
  }));
  console.log("панель:", JSON.stringify(panel));
  await ctx.shot("chk-more-menu", { jpeg: true });

  // Партнёрка: электротранспорт — горизонтальный скролл?
  await ctx.gotoRoute("partners");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim() === "Электротранспорт",
    );
    t?.click();
  });
  await ctx.sleep(1600);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("button")].find((b) =>
      /Волков/.test(b.textContent || "") && /₽/.test(b.textContent || ""),
    );
    row?.click();
  });
  await ctx.sleep(2000);
  const scrolls = await page.evaluate(() => {
    // Считаем только РЕАЛЬНЫЕ полосы прокрутки: overflow-x auto/scroll и
    // переполнение. truncate-элементы сюда не попадают.
    const bad = [...document.querySelectorAll("*")].filter((e) => {
      const ox = getComputedStyle(e).overflowX;
      return (ox === "auto" || ox === "scroll") && e.scrollWidth > e.clientWidth + 2;
    });
    return {
      count: bad.length,
      sample: bad.slice(0, 3).map((e) => e.tagName + "." + String(e.className).slice(0, 40)),
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log("скроллы:", JSON.stringify(scrolls));
  await ctx.shot("chk-pf-narrow", { jpeg: true });
}
