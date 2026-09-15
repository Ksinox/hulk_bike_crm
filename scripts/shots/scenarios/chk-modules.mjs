/** Проверка блока «Новые разделы» на «Развитии»: статусы Б1–Б5. */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Позже/.test(b.textContent || ""))?.click();
  });
  await ctx.gotoRoute("progress");
  await ctx.sleep(3500);
  // Окно «Свежие правки» всплывает уже на самом разделе — гасим здесь.
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /^Позже$/.test((b.textContent || "").trim()))
      ?.click();
  });
  await ctx.sleep(1200);

  // Скроллим к блоку «Новые разделы»
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find(
      (x) => x.children.length === 0 && /^Новые разделы$/.test((x.textContent || "").trim()),
    );
    el?.scrollIntoView({ block: "start" });
  });
  await ctx.sleep(1200);

  const rows = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("button, [role=button]")) {
      const t = (el.textContent || "").trim();
      const m = /^(Б[1-5])\s+(.+?)\s*(Готово, на проверке|Принято|В работе|Запланировано|Планируется)?$/s.exec(t);
      if (m && t.length < 200) out.push({ блок: m[1], название: m[2].trim(), статус: m[3] || "—" });
    }
    return out;
  });
  console.log("новые разделы:", JSON.stringify(rows, null, 0));
  await S("mod-01-blocks");
}
