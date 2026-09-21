/** Проверка раздела «Развитие»: видна ли группа «Планшет» и её пункты. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Посмотрю позже|^Позже$/.test(b.textContent || ""))?.click();
  });
  await ctx.gotoRoute("progress");
  await ctx.sleep(2600);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /^Позже$/.test((b.textContent || "").trim()))?.click();
  });
  await ctx.sleep(1200);

  const found = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      группа: t.includes("Планшет"),
      пункты: [
        "Новая аренда на планшете",
        "сводка сделки рядом с шагом",
        "кто и что чиним",
        "в два столбца",
        "полной формой",
        "окнами по центру",
        "прейскурант и варианты",
        "больше не обрезаются",
      ].filter((x) => t.includes(x)).length,
    };
  });
  console.log("на странице:", JSON.stringify(found));

  // открыть первый пункт группы и снять кадр с картинками
  const box = await page.evaluate(() => {
    const els = [...document.querySelectorAll("button, [role=button]")].filter((b) =>
      /Новая аренда на планшете/.test((b.textContent || "").trim()),
    );
    const el = els.sort((a, b) => a.textContent.length - b.textContent.length)[0];
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  console.log("пункт найден:", !!box);
  if (box) await page.mouse.click(box.x, box.y);
  await ctx.sleep(2500);
  const imgs = await page.evaluate(() =>
    [...document.images]
      .filter((i) => /progress\/v205/.test(i.src))
      .map((i) => ({ файл: i.src.split("/").pop(), загружено: i.complete && i.naturalWidth > 0 })),
  );
  console.log("картинки пункта:", JSON.stringify(imgs));
  await ctx.shot("chk-progress-tablet", { jpeg: true });
}
