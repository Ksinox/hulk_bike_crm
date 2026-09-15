/** Диагностика: открывается ли панель «Ещё» по наведению и по клику. */
export async function run(page, ctx) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text().slice(0, 160));
  });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2600);

  const pos = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    const btns = aside ? [...aside.querySelectorAll("button")] : [];
    const t = btns.find((b) => (b.textContent || "").trim().startsWith("Ещё"));
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  console.log("кнопка:", JSON.stringify(pos));

  // 1) наведение
  await page.mouse.move(600, 400);
  await ctx.sleep(150);
  if (pos) await page.mouse.move(pos.x, pos.y, { steps: 10 });
  await ctx.sleep(700);
  const afterHover = await page.evaluate(() => ({
    expanded: (document.querySelector("aside")?.className || "").includes("w-[232px]"),
    panel: /Ещё разделы/.test(document.body.innerText),
  }));
  console.log("после наведения:", JSON.stringify(afterHover));


  const afterHover2 = await page.evaluate(() => ({
    calls: window.__moreCalls ?? 0, dbg: window.__dbg, closes: window.__moreCloses ?? 0,
    panel: /Ещё разделы/.test(document.body.innerText),
    fixedDivs: [...document.querySelectorAll("div")].filter(
      (d) => getComputedStyle(d).position === "fixed" && d.textContent?.includes("Ещё разделы"),
    ).length,
  }));
  console.log("состояние:", JSON.stringify(afterHover2));
  console.log("ошибки:", JSON.stringify(errors.slice(0, 5)));
  await ctx.shot("chk-more-dbg", { jpeg: true });
}
