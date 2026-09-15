/** Отметки «свежее» на «Развитии» + карточка после правок. */
export async function run(page, ctx) {
  await page.evaluate(() => localStorage.removeItem("hulk-progress-seen"));
  await ctx.gotoRoute("progress");
  await ctx.sleep(3200);
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      banner: /Обновлено с прошлого просмотра/.test(t),
      count: t.match(/Обновлено с прошлого просмотра: (\d+)/)?.[1] ?? null,
      dots: document.querySelectorAll("span.bg-blue-600.rounded-full").length,
    };
  });
  console.log("развитие:", JSON.stringify(st));
  await ctx.shot("chk-fresh-top", { jpeg: true });

  // Открываем пункт — точка должна погаснуть
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Блок «Продажи» — от витрины/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(1200);
  const after = await page.evaluate(() => ({
    count:
      document.body.innerText.match(/Обновлено с прошлого просмотра: (\d+)/)?.[1] ??
      "0",
    stored: localStorage.getItem("hulk-progress-seen"),
  }));
  console.log("после открытия:", JSON.stringify(after));

  // Карточка техники: панель справа, три колонки, обложка
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2600);
  await page.evaluate(() => {
    [...document.querySelectorAll("button,a")]
      .filter((b) => (b.textContent || "").trim() === "Открыть")[0]?.click();
  });
  await ctx.sleep(2000);
  const card = await page.evaluate(() => {
    const nav = document.querySelector("nav.sticky");
    const main = [...document.querySelectorAll("main")].find(
      (m) => m.scrollHeight > m.clientHeight + 10,
    );
    const navR = nav?.getBoundingClientRect();
    const mainR = main?.getBoundingClientRect();
    return {
      railRight: navR && mainR ? navR.x > mainR.x + mainR.width / 2 : null,
      partnerInFleet: /Партнёрская/.test(
        document.querySelector("table")?.innerText || "",
      ),
      cover: /Фото модели|object-contain/.test(document.body.innerHTML.slice(0, 200000)),
    };
  });
  console.log("карточка:", JSON.stringify(card));
  await ctx.shot("chk-card-final", { jpeg: true });
}
