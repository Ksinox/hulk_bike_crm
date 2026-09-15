/** Числитель чипса, партнёрка с фильтром, «—» у завершённой аренды. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4000);
  console.log(
    "чипсы:",
    await page.evaluate(() => {
      const t = document.body.innerText;
      const pick = (label) => {
        const i = t.indexOf(label);
        return i < 0 ? "—" : t.slice(i, i + 60).split("\n").join(" / ");
      };
      return { парк: pick("Загрузка парка"), электро: pick("Электротранспорт") };
    }),
  );
  await ctx.shot("v6-park-chips", { jpeg: true });

  await ctx.gotoRoute("partners");
  await ctx.sleep(2500);
  const read = () =>
    page.evaluate(() => {
      const t = document.body.innerText;
      const tiles = ["Активные", "Просрочки", "Завершённые", "Всего"].map((l) => {
        const i = t.indexOf(l);
        return i < 0 ? `${l}:—` : `${l}:${t.slice(i + l.length, i + l.length + 4).trim().split("\n")[0]}`;
      });
      return {
        tiles,
        rows: [...document.querySelectorAll("button")].filter((b) => /#00\d\d/.test(b.textContent || "")).length,
        empty: (t.match(/Сейчас партнёрская техника не в аренде\.|Завершённых аренд пока нет\.|Просрочек нет\./) || ["—"])[0],
        badges: [...document.querySelectorAll("span")]
          .map((s) => (s.textContent || "").trim())
          .filter((x) => /^(—|\d+д)$/.test(x)),
      };
    });
  console.log("партнёрка по умолчанию:", JSON.stringify(await read()));
  await ctx.shot("v6-partner-active", { jpeg: true });

  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /^Завершённые/.test((b.textContent || "").trim()))
      ?.click();
  });
  await ctx.sleep(1200);
  console.log("партнёрка → завершённые:", JSON.stringify(await read()));
  await ctx.shot("v6-partner-finished", { jpeg: true });
}
