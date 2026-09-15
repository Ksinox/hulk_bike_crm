/** Кадры: карточка техники по вкладкам (узкий экран + мобила). */
export async function run(page, ctx) {
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2600);
  await page.evaluate(() => {
    const open = [...document.querySelectorAll("button,a")].filter(
      (b) => (b.textContent || "").trim() === "Открыть",
    );
    open[0]?.click();
  });
  await ctx.sleep(2200);
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      tabs: ["Обзор", "Экономика", "Аренды", "События", "Ремонты", "Расходы", "Документы"]
        .filter((x) => t.includes(x)),
      cardHeight: (() => {
        const m = [...document.querySelectorAll("main")].find(
          (x) => x.scrollHeight > 100 && /Скрыть/.test(x.innerText),
        );
        return m ? { scroll: m.scrollHeight, client: m.clientHeight } : null;
      })(),
    };
  });
  console.log("вкладки:", JSON.stringify(st));
  await ctx.shot("v3-card-tabs", { jpeg: true });

  // Вкладка «Экономика»
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Экономика",
    );
    b?.click();
  });
  await ctx.sleep(1200);
  await ctx.shot("v3-card-econ", { jpeg: true });

  // Мобильный вид
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3000);
  await page.evaluate(() => {
    const nav = [...document.querySelectorAll("button,a")].find(
      (b) => (b.textContent || "").trim() === "Скутеры",
    );
    nav?.click();
  });
  await ctx.sleep(2200);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("button,[role=button]")].find((b) =>
      /Gear|Jog|Dio/.test(b.textContent || ""),
    );
    row?.click();
  });
  await ctx.sleep(2200);
  const mob = await page.evaluate(() => ({
    card: /Скрыть|Технические характеристики/.test(document.body.innerText),
    tabs: /Обзор/.test(document.body.innerText),
  }));
  console.log("мобила:", JSON.stringify(mob));
  await ctx.shot("v3-card-mobile", { jpeg: true });
}
