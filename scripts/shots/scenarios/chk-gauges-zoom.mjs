/** Проверка: крупный план двух чипсов загрузки (жидкость vs энергия). */
export async function run(page, ctx) {
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(3200);
  const box = await page.evaluate(() => {
    // Каждый чипс — своя карточка; берём объединение двух прямоугольников.
    const pick = (re) => {
      const els = [...document.querySelectorAll("button")].filter(
        (b) => re.test(b.textContent || "") && /в\sаренде/.test(b.textContent || ""),
      );
      return els[els.length - 1] ?? null;
    };
    const a = pick(/Загрузка парка/);
    const b = pick(/Электротранспорт/);
    if (!a || !b) return null;
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const x = Math.min(ra.x, rb.x) - 14;
    const y = Math.min(ra.y, rb.y) - 14;
    return {
      x,
      y,
      width: Math.max(ra.right, rb.right) - x + 14,
      height: Math.max(ra.bottom, rb.bottom) - y + 14,
    };
  });
  const dbg = await page.evaluate(() => ({
    url: location.href,
    buttons: document.querySelectorAll("button").length,
    hasPark: /Загрузка парка/.test(document.body.innerText),
    textLen: document.body.innerText.length,
  }));
  console.log("dbg:", JSON.stringify(dbg));
  console.log("box:", JSON.stringify(box));
  if (box) await ctx.shot("chk-gauges-zoom", { clip: box });
}
