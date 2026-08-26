/** Правки 2.0, п.4: два чипса загрузки — наш парк и электротранспорт. */
import { clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2800);
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      park: /Загрузка парка/.test(t),
      electro: /Электротранспорт/.test(t),
      inPark: (t.match(/из (\d+) в парке/) || [])[1] ?? null,
      available: (t.match(/из (\d+) доступных/) || [])[1] ?? null,
    };
  });
  console.log("чипсы:", JSON.stringify(st));
  await ctx.shot("v2-4-gauges", { jpeg: true });
  const clip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (d) =>
            /Загрузка парка/.test(d.textContent || "") &&
            /Электротранспорт/.test(d.textContent || "") &&
            (d.textContent || "").length < 400,
        )
        .pop();
      return el ?? document.body;
    },
    10,
  );
  if (clip) await ctx.shot("v2-4-gauges-crop", { clip });

  // мобильный вид
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3000);
  const mob = await page.evaluate(() => {
    const t = document.body.innerText;
    return { park: /загрузка/i.test(t), electro: /Электротранспорт/.test(t) };
  });
  console.log("мобила:", JSON.stringify(mob));
  await ctx.shot("v2-4-gauges-mobile", { jpeg: true });
}
