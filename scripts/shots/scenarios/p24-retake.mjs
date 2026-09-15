/**
 * Пункт 24: счётчик клиентов подчиняется фильтру.
 * Кадр 1 — без фильтра («N клиентов»), кадр 2 — с фильтром («K из N …»).
 * Кроп берём по самому счётчику (span в шапке) + строка фильтров под ним.
 */
export async function run(page, ctx) {
  await ctx.gotoRoute("clients");
  await ctx.sleep(2200);

  /**
   * Зона кадра: шапка со счётчиком + строка фильтров. Блок «Новые заявки»
   * между ними в кадр не берём — он к пункту не относится и отвлекает.
   */
  const zone = async () =>
    page.evaluate(() => {
      const h1 = [...document.querySelectorAll("h1")].find(
        (e) => (e.textContent || "").trim() === "Клиенты",
      );
      const filterBtn = [...document.querySelectorAll("button")].find(
        (x) => (x.textContent || "").trim() === "С долгом",
      );
      if (!h1 || !filterBtn) return null;
      const header = h1.closest("header");
      const filterRow = filterBtn.closest("div")?.parentElement;
      if (!header || !filterRow) return null;
      const hr = header.getBoundingClientRect();
      const fr = filterRow.getBoundingClientRect();
      const pad = 16;
      return {
        header: {
          x: Math.max(0, hr.x - pad),
          y: Math.max(0, hr.y - pad),
          width: hr.width + pad * 2,
          height: hr.height + pad,
        },
        filters: {
          x: Math.max(0, fr.x - pad),
          y: Math.max(0, fr.y - pad / 2),
          width: fr.width + pad * 2,
          height: fr.height + pad,
        },
      };
    });

  const readCounter = () =>
    page.evaluate(() => {
      const h1 = [...document.querySelectorAll("h1")].find(
        (e) => (e.textContent || "").trim() === "Клиенты",
      );
      const span = h1?.parentElement?.querySelector("span");
      return (span?.textContent || "").replace(/\s+/g, " ").trim();
    });

  // Кадр 1 — без фильтра
  const before = await readCounter();
  console.log("no filter:", before);
  const z1 = await zone();
  if (z1) await ctx.shot("p24-1-all-v2", { clip: z1.header });

  // Включаем фильтр «С долгом» (точное совпадение — рядом есть строки
  // клиентов со словом «долг», в них попадать нельзя).
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "С долгом",
    );
    if (!b) return false;
    b.click();
    return true;
  });
  console.log("filter clicked:", clicked);
  // Кадр снимаем БЫСТРО: список клиентов поллится, и через несколько
  // секунд после клика состояние фильтра успевает сброситься.
  await ctx.sleep(1200);

  // Зона считается ДО кадра, счётчик — сразу после кадра (проверка, что
  // на снятом кадре действительно отфильтрованное состояние).
  const z2 = await zone();
  if (z2) {
    await ctx.shot("p24-2-filtered-v2", { clip: z2.header });
    await ctx.shot("p24-2-filters-row", { clip: z2.filters });
  }
  const after = await readCounter();
  console.log("with filter (after shot):", after);
}
