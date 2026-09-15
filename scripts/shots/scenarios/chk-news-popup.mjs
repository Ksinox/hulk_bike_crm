/** Окно новинок на «Развитии», точка в меню, продажа из «Новой сделки». */
export async function run(page, ctx) {
  await page.evaluate(() => localStorage.removeItem("hulk-progress-seen"));
  await ctx.gotoRoute("progress");
  await ctx.sleep(3000);
  const popup = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      open: /пунктов обновлено|пункта обновлены|пункт обновлён/.test(t),
      cta: /Посмотреть новые изменения/.test(t),
      noMarkAll: !/Отметить всё просмотренным/.test(t),
    };
  });
  console.log("окно:", JSON.stringify(popup));
  await ctx.shot("v5-progress-news", { jpeg: true });

  // Переход к первому новому
  const before = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Посмотреть новые изменения/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1600);
  const after = await page.evaluate(() => ({
    y: window.scrollY,
    popupGone: !/Посмотреть новые изменения/.test(document.body.innerText),
    stored: localStorage.getItem("hulk-progress-seen"),
  }));
  console.log("после перехода:", JSON.stringify({ before, ...after }));
  await ctx.shot("chk-news-scrolled", { jpeg: true });

  // Точка в меню
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2000);
  const nav = await page.evaluate(() => {
    const a = document.querySelector("aside");
    const rows = [...a.querySelectorAll("button")];
    const dev = rows.find((b) => /Развитие/.test(b.textContent || ""));
    return {
      hasBadge: !!dev && /\d/.test(dev.innerText.replace("Развитие", "")),
      text: dev?.innerText?.replace(/\n/g, " ") ?? null,
    };
  });
  console.log("меню:", JSON.stringify(nav));

  // «Новая сделка» → Продажа
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Новая сделка/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(900);
  const menu = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const sale = btns.find((b) => /Продажа/.test(b.textContent || ""));
    return {
      hasSale: !!sale,
      disabled: sale?.disabled ?? null,
      soon: /Продажа[\s\S]{0,40}скоро/.test(document.body.innerText),
    };
  });
  console.log("меню сделки:", JSON.stringify(menu));
  await ctx.shot("v5-deal-menu", { jpeg: true });

  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Продажа/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(2200);
  console.log("после выбора:", await page.evaluate(() => ({
    wizard: /Шаг 1 из 6/.test(document.body.innerText),
    noOwnButton: !/Новая продажа/.test(document.body.innerText),
  })));
  await ctx.shot("chk-sale-from-menu", { jpeg: true });
}
