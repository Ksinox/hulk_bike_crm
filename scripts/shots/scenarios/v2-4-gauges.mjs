/** Правки 2.0, п.4: два чипса загрузки — наш парк и электротранспорт. */

export async function run(page, ctx) {
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2800);
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      park: /Загрузка парка/.test(t),
      electro: /Электротранспорт/.test(t),
      inPark: (t.match(/из (\d+) в парке/) || [])[1] ?? null,
      available: (t.match(/из (\d+) доступных/) || [])[1] ?? null,
    };
  });
  console.log("чипсы:", JSON.stringify(st));

  /**
   * Кадр для лендинга делаем ДЕТЕРМИНИРОВАННЫМ: иначе разряд молнии (он живёт
   * доли секунды) и пузырьки попадают в кадр как повезёт. Ставим анимации на
   * нужный момент и замораживаем — снимаем не «случайный миг», а тот, что
   * показывает эффект. Запускать с SHOT_ANIM=1.
   */
  const frozen = await page.evaluate(() => {
    let n = 0;
    for (const a of document.getAnimations()) {
      const name = a.animationName || "";
      let t = null;
      if (/^pk(Flash|Draw|LeaderFade)/.test(name)) t = 265; // пик вспышки
      else if (name === "pkBubble") t = 2100; // пузырьки на середине подъёма
      if (t === null) continue;
      a.currentTime = t;
      a.pause();
      n++;
    }
    return n;
  });
  console.log("заморожено анимаций:", frozen);
  await ctx.sleep(150);

  await ctx.shot("v2-4-gauges", { jpeg: true });
  // Крупный план обоих колец: чипсы — разные карточки, поэтому берём
  // объединение их прямоугольников. Внимание: «5 в аренде» набрано с
  // неразрывными пробелами, в регулярке нужен \s, а не обычный пробел.
  const clip = await page.evaluate(() => {
    const pick = (re) => {
      const els = [...document.querySelectorAll("button")].filter(
        (b) =>
          re.test(b.textContent || "") && /в\sаренде/.test(b.textContent || ""),
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
  if (clip) await ctx.shot("v2-4-gauges-crop", { clip });

  // мобильный вид
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3000);
  const mob = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      park: /загрузка/i.test(t),
      // На мобиле чипсы подписаны коротко: «Бензиновые» и «Электро».
      petrol: /Бензиновые/.test(t),
      electro: /Электро/.test(t),
      incomingBelow: /Поступит сегодня/.test(t),
    };
  });
  console.log("мобила:", JSON.stringify(mob));
  await ctx.shot("v2-4-gauges-mobile", { jpeg: true });
}
