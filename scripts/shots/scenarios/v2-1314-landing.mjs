/** Лендинг: дровер карточки техники (2.14), адаптив с дроверами (2.13),
 *  табы техники в «Арендах» (2.9). */
export async function run(page, ctx) {
  // 1. Большой экран: Скутеры → дровер карточки
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2600);
  await page.evaluate(() => {
    const open = [...document.querySelectorAll("button,a")].filter(
      (b) => (b.textContent || "").trim() === "Открыть",
    );
    open[0]?.click();
  });
  await ctx.sleep(2200);
  await ctx.shot("v2-14-drawer-big", { jpeg: true });

  // 2. «Аренды»: таб «Партнёрская»
  await ctx.gotoRoute("rentals");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll("button")].find((b) =>
      /Партнёрская/.test(b.textContent || ""),
    );
    t?.click();
  });
  await ctx.sleep(1500);
  const tabs = await page.evaluate(() => ({
    rows: [...document.querySelectorAll("tr")].length,
    hasDio: /Dio/.test(document.body.innerText),
  }));
  console.log("таб партнёрская:", JSON.stringify(tabs));
  await ctx.shot("v2-9-tabs", { jpeg: true });

  // 3. 1280×720: скутеры с открытым дровером
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
  await ctx.sleep(2200);
  await ctx.shot("v2-14-drawer-1280", { jpeg: true });

  // 4. 1280×720: аренды с открытой карточкой
  await ctx.gotoRoute("rentals");
  await ctx.sleep(2400);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("tr")].find((b) =>
      /#00\d\d/.test(b.textContent || ""),
    );
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await ctx.sleep(2000);
  await ctx.shot("v2-13-drawer-1280", { jpeg: true });

  // 5. 1280×720: сайдбар прокручен до нижних пунктов
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2000);
  await page.evaluate(() => {
    const scroller = document.querySelector("aside .sidebar-scroll");
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
  await ctx.sleep(500);
  const clip = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    if (!aside) return null;
    const r = aside.getBoundingClientRect();
    return { x: r.x - 6, y: r.y - 6, width: r.width + 12, height: r.height + 12 };
  });
  if (clip) await ctx.shot("v2-13-sidebar-1280", { clip });
}
