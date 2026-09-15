/** Помещается ли содержимое синей части и сколько строк платежей видно. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1370, height: 860, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3400);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("div")].find(
      (el) => el.className && String(el.className).includes("cursor-pointer") &&
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
    const blue = [...document.querySelectorAll("div")].find(
      (d) => d.className && String(d.className).includes("flex min-h-0 flex-col overflow-hidden") &&
        /Выручка/.test(d.textContent || ""),
    );
    const white = [...document.querySelectorAll("div")].find(
      (d) => d.className && String(d.className).includes("rounded-b-[16px] bg-white"),
    );
    const scroller = white?.querySelector("div.overflow-y-auto");
    return {
      синяя: blue
        ? { высота: Math.round(blue.clientHeight), нужно: Math.round(blue.scrollHeight),
            обрезано: blue.scrollHeight - blue.clientHeight }
        : "не найдена",
      белая: white ? Math.round(white.getBoundingClientRect().height) : null,
      списокВидно: scroller ? Math.round(scroller.clientHeight) : null,
      строк: scroller ? scroller.querySelectorAll("button").length : null,
      естьНалБезнал: /Наличные/.test(document.body.innerText),
    };
  }));
}
