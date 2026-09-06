/** Кнопка «На второй монитор» действительно открывает отдельное окно. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4000);
  await ctx.gotoRoute("analytics");
  await ctx.sleep(3000);
  const browser = page.browser();
  const before = (await browser.pages()).length;
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /На второй монитор/.test(b.textContent || ""))
      ?.click();
  });
  await ctx.sleep(3500);
  const pages = await browser.pages();
  const wall = pages.find((p) => /analytics-wall/.test(p.url()));
  let text = null;
  if (wall) {
    await new Promise((r) => setTimeout(r, 5000));
    text = (await wall.evaluate(() => document.body.innerText)).slice(0, 80).replace(/\s+/g, " ");
  }
  console.log("окно:", JSON.stringify({
    былоВкладок: before,
    сталоВкладок: pages.length,
    адрес: wall ? wall.url().replace(/^https?:\/\/[^/]+/, "") : null,
    заголовок: text,
  }));
}
