/**
 * Кадры и координаты для концепта «Первый вход после релиза».
 * Снимает экраны preview и печатает прямоугольники кнопок в процентах
 * кадра — по ним в прототипе ставятся подсказки на месте.
 */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  const dismiss = () =>
    page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => /^Позже$/.test((b.textContent || "").trim()))
        ?.click();
    });
  const rects = (frame) =>
    page.evaluate((frame) => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const out = [];
      for (const el of document.querySelectorAll("button, a, input, [role=button], [title]")) {
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > H) continue;
        const label = (
          (el.getAttribute("title") || "") + " " +
          (el.getAttribute("aria-label") || "") + " " +
          (el.getAttribute("placeholder") || "") + " " +
          (el.textContent || "")
        ).replace(/\s+/g, " ").trim().slice(0, 40);
        if (!label) continue;
        out.push({
          t: label,
          x: +((r.left / W) * 100).toFixed(2),
          y: +((r.top / H) * 100).toFixed(2),
          w: +((r.width / W) * 100).toFixed(2),
          h: +((r.height / H) * 100).toFixed(2),
        });
      }
      console.log("RECTS " + frame + " " + JSON.stringify(out));
      return out.length;
    }, frame);
  page.on("console", (m) => {
    const t = m.text();
    if (t.startsWith("RECTS ")) console.log(t);
  });

  /* ---------------- Компьютер ---------------- */
  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5500);
  await dismiss();
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(3500);
  await dismiss();
  await page.mouse.move(900, 500);
  await ctx.sleep(600);
  await rects("d-home");
  await S("cr-d-home");

  for (const [route, name] of [
    ["sales", "cr-d-sales"],
    ["rassrochki", "cr-d-buyout"],
    ["service", "cr-d-service"],
    ["analytics", "cr-d-analytics"],
  ]) {
    await ctx.gotoRoute(route);
    await ctx.sleep(3500);
    await page.mouse.move(900, 600);
    await ctx.sleep(400);
    await rects(name);
    await S(name);
  }

  /* ---------------- Телефон ---------------- */
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5500);
  await dismiss();
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(3000);
  await rects("m-home");
  await S("cr-m-home");

  // «Ещё» — там живут новые разделы на телефоне
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /^Ещё$/.test((b.textContent || "").trim()))
      ?.click();
  });
  await ctx.sleep(1500);
  await rects("m-more");
  await S("cr-m-more");

  for (const [route, name] of [
    ["sales", "cr-m-sales"],
    ["service", "cr-m-service"],
    ["analytics", "cr-m-analytics"],
  ]) {
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(4200);
    await dismiss();
    await ctx.gotoRoute(route);
    await ctx.sleep(3500);
    await rects(name);
    await S(name);
  }
}
