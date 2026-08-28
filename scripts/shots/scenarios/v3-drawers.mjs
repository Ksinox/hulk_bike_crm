/** Кадры v3 (28.08): дровер техники, подсветка строки, узкие экраны. */
export async function run(page, ctx) {
  // ── Широкий экран: Скутеры + дровер карточки ──
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2600);
  await page.evaluate(() => {
    const open = [...document.querySelectorAll("button,a")].filter(
      (b) => (b.textContent || "").trim() === "Открыть",
    );
    open[0]?.click();
  });
  await ctx.sleep(2200);
  const st = await page.evaluate(() => ({
    twoCols: !!document.querySelector("main .grid"),
    highlighted: [...document.querySelectorAll('[role="button"]')].some((r) =>
      (r.className || "").includes("bg-blue-50"),
    ),
  }));
  console.log("широкий:", JSON.stringify(st));
  await ctx.shot("v3-scooter-drawer", { jpeg: true });

  // Низ карточки: блок окупаемости целиком
  const clip = await page.evaluate(() => {
    const main = [...document.querySelectorAll("main")].find(
      (m) => m.scrollHeight > m.clientHeight + 10,
    );
    if (!main) return null;
    const roi = [...main.querySelectorAll("section")].find((x) =>
      /Окупаемость и здоровье/.test(x.textContent || ""),
    );
    if (!roi) return null;
    roi.scrollIntoView({ block: "start" });
    const r = roi.getBoundingClientRect();
    return { x: r.x - 6, y: r.y - 6, width: r.width + 12, height: Math.min(r.height + 12, 900) };
  });
  await ctx.sleep(600);
  if (clip) await ctx.shot("v3-scooter-roi", { clip });

  // ── Узкий ноутбук 1280×720: список + дровер ──
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    const open = [...document.querySelectorAll("button,a")].filter(
      (b) => (b.textContent || "").trim() === "Открыть",
    );
    open[0]?.click();
  });
  await ctx.sleep(2200);
  await ctx.shot("v3-scooter-drawer-1280", { jpeg: true });

  // ── Партнёрка на 1280 с дровером аренды ──
  await ctx.gotoRoute("partners");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    const tr = [...document.querySelectorAll("tr")].find((x) =>
      /#00\d\d/.test(x.textContent || ""),
    );
    tr?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await ctx.sleep(2000);
  await ctx.shot("v3-partner-drawer-1280", { jpeg: true });

  // ── Дашборд 1280 с быстрым просмотром ──
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2400);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("button")].find((b) =>
      /Просрочка · \d+ дн/.test(b.textContent || ""),
    );
    el?.click();
  });
  await ctx.sleep(2200);
  await ctx.shot("v3-dash-drawer-1280", { jpeg: true });
}
