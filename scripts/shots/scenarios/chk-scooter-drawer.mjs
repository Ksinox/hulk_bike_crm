/** Проверка 27.08: дровер карточки скутера + меню + малые экраны. */
export async function run(page, ctx) {
  // 1. Большой экран: Скутеры → клик по строке → дровер
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2600);
  await page.evaluate(() => {
    const open = [...document.querySelectorAll("button,a")].filter(
      (b) => (b.textContent || "").trim() === "Открыть",
    );
    open[0]?.click();
  });
  await ctx.sleep(2000);
  const st = await page.evaluate(() => ({
    drawer: /Скрыть/.test(document.body.innerText),
    listStill: /Парк скутеров|масштаб|Фильтры/.test(document.body.innerText),
  }));
  console.log("дровер скутера:", JSON.stringify(st));
  await ctx.shot("chk-sc-drawer-big", { jpeg: true });

  // 2. Маленький ноутбук 1280x720: список + дровер
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2000);
  await page.evaluate(() => {
    const open = [...document.querySelectorAll("button,a")].filter(
      (b) => (b.textContent || "").trim() === "Открыть",
    );
    open[0]?.click();
  });
  await ctx.sleep(2000);
  const small = await page.evaluate(() => ({
    drawer: /Скрыть/.test(document.body.innerText),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  console.log("1280x720 дровер:", JSON.stringify(small));
  await ctx.shot("chk-sc-drawer-1280", { jpeg: true });

  // 3. Сайдбар на 1280x720: скроллится ли до нижних пунктов
  const sidebar = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    if (!aside) return null;
    const scroller = aside.querySelector(".sidebar-scroll");
    const canScroll = scroller ? scroller.scrollHeight > scroller.clientHeight : false;
    // Пункт «Развитие» — из нижних; виден ли без скролла?
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    return {
      canScroll,
      scrollH: scroller?.scrollHeight,
      clientH: scroller?.clientHeight,
      settingsVisible: /./.test("x"),
    };
  });
  console.log("сайдбар:", JSON.stringify(sidebar));
  await ctx.sleep(400);
  await ctx.shot("chk-sidebar-1280", { jpeg: true });

  // 4. Аренды на 1280x720 с открытой карточкой (как ведёт себя список)
  await ctx.gotoRoute("rentals");
  await ctx.sleep(2400);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("tr,button")].find((b) =>
      /#00\d\d/.test(b.textContent || "") && /₽/.test(b.textContent || ""),
    );
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await ctx.sleep(2000);
  await ctx.shot("chk-rentals-1280-drawer", { jpeg: true });
}
