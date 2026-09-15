/** «Развитие» 2.90, СТАЛО: широкий список общего поиска + кадр для карточки «Поиск» в презентации 2.0. */
import path from "node:path";

export async function run(page, ctx) {
  const typeInSearch = async (t) => {
    const box = await page.evaluate(() => {
      const i = document.querySelector('input[placeholder^="Поиск: клиент"]');
      const r = i.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(box.x, box.y);
    await page.keyboard.type(t, { delay: 60 });
    await ctx.sleep(1600);
  };
  await page.setViewport({ width: 1470, height: 1000, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await typeInSearch("7");
  const w = await page.evaluate(() => {
    const i = document.querySelector('input[placeholder^="Поиск: клиент"]');
    const list = i.closest(".relative")?.querySelector(".absolute.top-full");
    const cut = [...(list?.querySelectorAll(".truncate") ?? [])].filter((el) => el.scrollWidth > el.clientWidth + 1).length;
    return { ширинаСписка: Math.round(list?.getBoundingClientRect().width ?? 0), обрезанныхСтрок: cut };
  });
  console.log("список:", JSON.stringify(w));
  await ctx.shot("search-list-now", { jpeg: true });

  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.5 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await typeInSearch("7");
  await page.screenshot({ path: path.resolve("apps/web/public/release/2.0/d-search.jpg"), type: "jpeg", quality: 80 });
  console.log("кадр d-search");
}
