/**
 * Финальная проверка: обзор парка на узком экране, мобильный список
 * скутеров (чип «Проданы») и новые пункты 25-26 на лендинге «Развитие».
 */
export async function run(page, ctx) {
  // 1) Обзор парка на планшете — не разъезжается ли сетка
  await page.setViewport({ width: 900, height: 1100, deviceScaleFactor: 2 });
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2400);
  await ctx.shot("chk-fleet-900", { jpeg: true });

  // 2) Лендинг «Развитие»: новые пункты 25-26
  await page.setViewport({ width: 1440, height: 1300, deviceScaleFactor: 2 });
  await ctx.gotoRoute("progress");
  await ctx.sleep(2600);
  const landing = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      p25: /Партнёрская техника и тип/.test(t),
      p26: /Проданная техника выбывает/.test(t),
      count: (t.match(/пункт/gi) || []).length,
    };
  });
  console.log("лендинг:", JSON.stringify(landing));
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find((e) =>
      /Проданная техника выбывает/.test(e.textContent || ""),
    );
    el?.scrollIntoView({ block: "center" });
  });
  await ctx.sleep(900);
  await ctx.shot("chk-landing-26", { jpeg: true });

  // 3) Мобильный список скутеров
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(ctx.base + "/?mobile=1", { waitUntil: "networkidle2" });
  await ctx.sleep(3000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button, a")]
      .filter((x) => /Скутеры/.test((x.textContent || "").trim()))
      .pop();
    b?.click();
  });
  await ctx.sleep(2200);
  const chips = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      gone: /Выбыли/.test(t),
      hash: /[A-Za-zА-Яа-я]+\s*#\s*\d\d/.test(t),
      head: t.slice(0, 160).replace(/\n+/g, " · "),
    };
  });
  console.log("мобильные скутеры:", JSON.stringify(chips));
  await ctx.shot("chk-mobile-scooters", { jpeg: true });
}
