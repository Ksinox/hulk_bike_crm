/** Пересъёмка: таб «Партнёрская» в общих «Арендах» (чистое состояние) + мобила. */
export async function run(page, ctx) {
  await ctx.gotoRoute("rentals");
  await ctx.sleep(2400);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll("button")].find((b) =>
      /Партнёрская/.test(b.textContent || ""),
    );
    t?.click();
  });
  await ctx.sleep(1500);
  const st = await page.evaluate(() => ({
    dio: /Dio/.test(document.body.innerText),
    noForeignCard: !/Информация о клиенте/.test(document.body.innerText),
  }));
  console.log("десктоп:", JSON.stringify(st));
  await ctx.shot("v2-9-tabs", { jpeg: true });

  // Мобила: те же табы
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3000);
  await page.evaluate(() => {
    const nav = [...document.querySelectorAll("button,a")].find(
      (b) => (b.textContent || "").trim() === "Аренды",
    );
    nav?.click();
  });
  await ctx.sleep(2000);
  const mob = await page.evaluate(() => {
    const t = [...document.querySelectorAll("button")].find((b) =>
      /Партнёрская/.test(b.textContent || ""),
    );
    t?.click();
    return { hasTab: !!t };
  });
  await ctx.sleep(1400);
  const mob2 = await page.evaluate(() => ({
    dio: /Dio/.test(document.body.innerText),
  }));
  console.log("мобила:", JSON.stringify({ ...mob, ...mob2 }));
  await ctx.shot("v2-9-tabs-mobile", { jpeg: true });
}
