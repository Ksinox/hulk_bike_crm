/** Плашка электротранспорта должна быть на месте и без активной аренды. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4000);
  console.log("дашборд:", await page.evaluate(() => {
    const t = document.body.innerText;
    const i = t.indexOf("Электротранспорт");
    return {
      естьЧипс: i >= 0,
      текст: i < 0 ? "—" : t.slice(i, i + 90).split("\n").join(" / "),
      парк: (t.match(/Загрузка парка[\s\S]{0,70}/) || ["—"])[0].split("\n").join(" / "),
    };
  }));
  await ctx.shot("v6-electro-chip", { jpeg: true });
}
