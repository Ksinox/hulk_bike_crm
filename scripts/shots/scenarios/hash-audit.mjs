/**
 * Аудит правки заказчика: формата «Jog #03» не должно остаться нигде.
 * Обходим ключевые экраны и ищем в тексте страницы «<Модель> #NN».
 * Номера сделок вида «#0041» (4 цифры) — легальны, их пропускаем.
 */
const ROUTES = [
  ["dashboard", {}],
  ["rentals", {}],
  ["fleet", {}],
  ["clients", {}],
  ["partners", {}],
  ["service", {}],
  ["debtors", {}],
];

export async function run(page, ctx) {
  const bad = [];
  for (const [route, extra] of ROUTES) {
    await ctx.gotoRoute(route, extra);
    await ctx.sleep(2200);
    const hits = await page.evaluate(() => {
      const t = document.body.innerText;
      // «Jog #03», «Gear #8» — модель + решётка + 1-3 цифры.
      const re = /[A-Za-zА-Яа-я]{2,}\s*#\s*\d{1,3}(?!\d)/g;
      return [...new Set(t.match(re) ?? [])];
    });
    if (hits.length) bad.push({ route, hits });
    console.log(route, "→", hits.length ? JSON.stringify(hits) : "чисто");
  }
  console.log("ИТОГ:", bad.length ? JSON.stringify(bad) : "решёток нет");
}
