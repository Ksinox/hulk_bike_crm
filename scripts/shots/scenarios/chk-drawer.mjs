/** Быстрый просмотр клиента с дашборда: карточка должна помещаться целиком. */
export async function run(page, ctx) {
  for (const w of [1370, 1280, 1150, 1024]) {
    await page.setViewport({ width: w, height: 860, deviceScaleFactor: 1 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await ctx.sleep(3400);
    // Открываем клиента из «Долгов к сбору»
    await page.evaluate(() => {
      const row = [...document.querySelectorAll("div")].find(
        (el) =>
          el.className &&
          String(el.className).includes("cursor-pointer") &&
          /Сергей Петров/.test(el.textContent || ""),
      );
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await ctx.sleep(900);
    // Из меню строки выбираем «Карточка клиента»
    await page.evaluate(() => {
      [...document.querySelectorAll("button,div[role=menuitem]")]
        .find((b) => /Карточка клиента/.test(b.textContent || ""))
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await ctx.sleep(1800);
    const st = await page.evaluate(() => {
      const aside = [...document.querySelectorAll("aside")].find(
        (a) => a.getBoundingClientRect().width > 200,
      );
      const r = aside?.getBoundingClientRect();
      const scroller = aside?.parentElement;
      const bar = [...document.querySelectorAll("div")].find(
        (d) => d.className && String(d.className).includes("rounded-xl bg-surface px-3 py-2.5"),
      );
      return {
        barHeight: bar ? Math.round(bar.getBoundingClientRect().height) : null,
        // всё ли в шапке помещается: считаем иконки правее её правой границы
        barSpill: bar
          ? [...bar.querySelectorAll("button,a,div")].filter(
              (el) =>
                el.getBoundingClientRect().width > 8 &&
                el.getBoundingClientRect().right >
                  bar.getBoundingClientRect().right + 1,
            ).length
          : null,
        drawerWidth: r ? Math.round(r.width) : null,
        drawerRight: r ? Math.round(r.right) : null,
        viewport: window.innerWidth,
        // сколько карточки видно: если правый край за окном — обрезана
        cutRight: r ? Math.max(0, Math.round(r.right - window.innerWidth)) : null,
        rowScroll: scroller
          ? scroller.scrollWidth - scroller.clientWidth
          : null,
        pageOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      };
    });
    console.log(`${w}px:`, JSON.stringify(st));
    await ctx.shot(`chk-drawer-${w}`, { jpeg: true });
  }
}
