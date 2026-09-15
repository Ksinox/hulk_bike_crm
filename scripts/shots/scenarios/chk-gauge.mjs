/** Ширина плашек загрузки при открытой карточке. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1150, height: 860, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3400);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("div")].find(
      (el) =>
        el.className &&
        String(el.className).includes("cursor-pointer") &&
        /Сергей Петров/.test(el.textContent || ""),
    );
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await ctx.sleep(900);
  await page.evaluate(() => {
    [...document.querySelectorAll("button,div[role=menuitem]")]
      .find((b) => /Карточка клиента/.test(b.textContent || ""))
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await ctx.sleep(2500);
  console.log(await page.evaluate(() => {
    const cards = [...document.querySelectorAll("div")].filter((d) =>
      /Загрузка парка|Электротранспорт/.test(d.textContent || "") &&
      d.className && String(d.className).includes("rounded-xl p-[18px]"),
    );
    return cards.map((c) => {
      const r = c.getBoundingClientRect();
      const btn = c.querySelector("button");
      return {
        w: Math.round(r.width),
        stacked: btn ? String(btn.className).includes("flex-col") : null,
        text: (c.textContent || "").slice(0, 40),
      };
    });
  }));
}
