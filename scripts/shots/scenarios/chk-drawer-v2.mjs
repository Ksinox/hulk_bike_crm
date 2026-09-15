/** Проверка 28.08 v2: дровер скутера, подсветка, раскладка, низ карточки. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

  // 1. Скутеры: открыть карточку → подсветка строки + обзор компактный
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
    const rows = [...document.querySelectorAll('[role="button"]')].filter((r) =>
      /км/.test(r.textContent || ""),
    );
    const highlighted = rows.filter((r) =>
      (r.className || "").includes("bg-blue-50"),
    ).length;
    return {
      drawer: /Скрыть/.test(document.body.innerText),
      highlightedRows: highlighted,
      overflowX:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    };
  });
  console.log("скутеры:", JSON.stringify(st));
  await ctx.shot("chk-v2-fleet-top", { jpeg: true });

  // 2. Скролл дровера до самого низа — виден ли последний блок целиком
  const scrollInfo = await page.evaluate(() => {
    const main = [...document.querySelectorAll("main")].find(
      (m) => m.scrollHeight > m.clientHeight + 10,
    );
    if (!main) return null;
    main.scrollTop = main.scrollHeight;
    return { scrollH: main.scrollHeight, clientH: main.clientHeight };
  });
  await ctx.sleep(700);
  console.log("скролл:", JSON.stringify(scrollInfo));
  await ctx.shot("chk-v2-fleet-bottom", { jpeg: true });

  // 3. Партнёрка: сколько колонок теперь видно при дровере
  await ctx.gotoRoute("partners");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    const tr = [...document.querySelectorAll("tr")].find((x) =>
      /#00\d\d/.test(x.textContent || ""),
    );
    tr?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await ctx.sleep(2000);
  const cols = await page.evaluate(() => ({
    visible: [...document.querySelectorAll("th")]
      .filter((t) => t.offsetParent !== null)
      .map((t) => (t.textContent || "").trim())
      .filter((t) => t.length > 1),
    rowHighlighted: [...document.querySelectorAll("tr")].some((r) =>
      (r.className || "").includes("bg-blue-50"),
    ),
  }));
  console.log("партнёрка:", JSON.stringify(cols));
  await ctx.shot("chk-v2-partner", { jpeg: true });
}
