/**
 * Пункт 19: верхний ряд дашборда без плитки «Активных аренд» —
 * загрузка парка осталась единственным источником этой цифры.
 */
export async function run(page, ctx) {
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(3000);

  const state = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      hasGauge: /Загрузка парка/.test(t),
      hasActiveTile: /Активных аренд/.test(t),
      gaugeText: (t.match(/Загрузка парка[\s\S]{0,60}/) || [""])[0]
        .replace(/\n+/g, " · "),
    };
  });
  console.log("dashboard:", JSON.stringify(state));

  // Кроп ряда: от кольца «Загрузка парка» до правого края верхних плиток.
  const clip = await page.evaluate(() => {
    const label = [...document.querySelectorAll("*")].find(
      (e) =>
        (e.textContent || "").trim() === "Загрузка парка" && !e.children.length,
    );
    if (!label) return null;
    // поднимаемся до карточки кольца, затем до строки-грида
    let card = label.closest("div");
    for (let i = 0; i < 6 && card; i++) {
      const r = card.getBoundingClientRect();
      if (r.height > 120) break;
      card = card.parentElement;
    }
    const row = card?.parentElement?.parentElement;
    const target = row ?? card;
    if (!target) return null;
    const r = target.getBoundingClientRect();
    const pad = 18;
    return {
      x: Math.max(0, r.x - pad),
      y: Math.max(0, r.y - pad),
      width: Math.min(r.width + pad * 2, window.innerWidth - r.x + pad),
      height: r.height + pad * 2,
    };
  });
  if (clip) await ctx.shot("p19-1-row-crop", { clip });
  await ctx.shot("p19-after-dashboard", { jpeg: true });
}
