/** Отладка клика «Безнал» в мини-меню бейджа. */
export async function run(page, ctx) {
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      console.log("[console]", m.type(), m.text().slice(0, 200));
  });
  page.on("response", (r) => {
    if (/\/api\/payments\/\d+/.test(r.url()))
      console.log("[net]", r.request().method(), r.status(), r.url().slice(-30));
  });
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2500);
  const st = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("div")].filter(
      (d) =>
        /4[\s  ]200/.test(d.textContent || "") &&
        /нал/i.test(d.textContent || "") &&
        (d.textContent || "").length < 160,
    );
    const row = rows.pop();
    if (!row) return { found: false };
    row.scrollIntoView({ block: "center" });
    const badge = [...row.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim().toLowerCase() === "нал",
    );
    badge?.click();
    return { found: !!badge };
  });
  console.log("badge:", JSON.stringify(st));
  await ctx.sleep(900);
  const menu = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")]
      .filter((x) => (x.textContent || "").trim() === "Безнал")
      .map((b) => ({
        text: (b.textContent || "").trim(),
        rect: b.getBoundingClientRect().toJSON(),
      }));
    return btns;
  });
  console.log("beznal buttons:", JSON.stringify(menu));
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")]
      .filter((x) => (x.textContent || "").trim() === "Безнал")
      .pop();
    if (!b) return false;
    b.click();
    return true;
  });
  console.log("clicked:", clicked);
  await ctx.sleep(3000);
}
