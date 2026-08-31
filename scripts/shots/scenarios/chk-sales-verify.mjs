/** Контроль после правок + чистка тестовых черновиков. */
const API = "https://api-preview.104-128-128-96.sslip.io";

export async function run(page, ctx) {
  // Убираем пустые черновики, оставшиеся от прогонов
  const cleaned = await page.evaluate(async (API) => {
    const r = await fetch(`${API}/api/sales/deals`, { credentials: "include" });
    const { items } = await r.json();
    const junk = items.filter((d) => d.status === "draft" && !d.scooterId);
    for (const d of junk) {
      await fetch(`${API}/api/sales/deals/${d.id}`, {
        method: "DELETE",
        credentials: "include",
      });
    }
    return { total: items.length, removed: junk.length };
  }, API);
  console.log("чистка:", JSON.stringify(cleaned));

  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3000);
  await ctx.gotoRoute("sales");
  await ctx.sleep(2200);

  // Сделки + дровер: проверяем, что суммы в одну строку и статус виден
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Сделки")?.click();
  });
  await ctx.sleep(1500);
  await page.evaluate(() => {
    document.querySelector("tbody tr")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
  });
  await ctx.sleep(1500);
  const st = await page.evaluate(() => {
    const cells = [...document.querySelectorAll("tbody tr:first-child td")];
    return {
      statusVisible: /Продано/.test(
        cells[cells.length - 1]?.innerText || "",
      ),
      moneyOneLine: !/\n/.test(
        cells.find((c) => /₽/.test(c.innerText))?.innerText || "x\ny",
      ),
      overflowX:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log("таблица:", JSON.stringify(st));
  await ctx.shot("chk-ver-deals", { jpeg: true });

  // Поиск по кириллическому VIN
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) =>
      /VIN/.test(i.placeholder || ""),
    );
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(inp), "value",
    ).set;
    setter.call(inp, "кнкнкн");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ctx.sleep(1200);
  console.log("поиск по двигателю:", await page.evaluate(() => ({
    found: document.body.innerText.match(/найдено (\d+)/)?.[1],
  })));
  await ctx.shot("chk-ver-search", { jpeg: true });

  // Мобилка: плитки
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  await ctx.gotoRoute("sales");
  await ctx.sleep(2000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "В продаже")?.click();
  });
  await ctx.sleep(1500);
  const mob = await page.evaluate(() => ({
    truncated: /ПРИБ…|ПРОД…/.test(document.body.innerText),
    overflowX:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  console.log("мобилка:", JSON.stringify(mob));
  await ctx.shot("chk-ver-mobile", { jpeg: true });
}
