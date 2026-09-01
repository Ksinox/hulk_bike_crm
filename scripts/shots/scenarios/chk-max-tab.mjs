/** Два клика по MAX из карточки клиента → одна вкладка, а не две. */
export async function run(page, ctx) {
  const browser = page.browser();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3400);
  await ctx.gotoRoute("clients");
  await ctx.sleep(2400);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Алексей Смирнов/.test(b.textContent || ""))
      ?.click();
  });
  await ctx.sleep(1800);

  const before = (await browser.pages()).length;
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      (x.getAttribute("title") || "").includes("MAX"),
    );
    if (!b) return "нет кнопки";
    b.click();
    return "ок";
  });
  await ctx.sleep(3000);
  const afterFirst = (await browser.pages()).length;

  await page.bringToFront();
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((x) => (x.getAttribute("title") || "").includes("MAX"))
      ?.click();
  });
  await ctx.sleep(3000);
  const afterSecond = (await browser.pages()).length;

  console.log("клик:", clicked);
  console.log(
    `вкладок было ${before} → после 1-го клика ${afterFirst} → после 2-го ${afterSecond}`,
  );
  console.log(
    "итог:",
    afterSecond === afterFirst ? "вкладка переиспользована ✔" : "открылась вторая ✘",
  );
  const urls = (await browser.pages()).map((p) => p.url()).filter((u) => u.includes("max.ru"));
  console.log("вкладки MAX:", urls);
}
