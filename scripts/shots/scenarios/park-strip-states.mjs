/** Лента парка: активный фильтр, планшет, мобильный слой. */
import { clipOf } from "./p9-common.mjs";

const strip = (page) =>
  clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("section")]
        .filter((d) => /ПАРК В ОБОРОТЕ|Парк в обороте/i.test(d.textContent || ""))
        .pop();
      return el ?? document.body;
    },
    10,
  );

export async function run(page, ctx) {
  // 1) активный фильтр — чужие штрихи гаснут
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2400);
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /В аренде$/.test((x.textContent || "").trim()),
    );
    if (!b) return false;
    b.click();
    return true;
  });
  await ctx.sleep(900);
  console.log("фильтр «В аренде»:", clicked);
  let c = await strip(page);
  if (c) await ctx.shot("p26-5-strip-filtered", { clip: c });
  await ctx.shot("p26-6-filtered-full", { jpeg: true });

  // 2) планшет
  await page.setViewport({ width: 900, height: 1100, deviceScaleFactor: 2 });
  await ctx.sleep(1200);
  c = await strip(page);
  if (c) await ctx.shot("chk-strip-900", { clip: c });

  // 3) мобильный слой
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2600);
  const mob = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      strip: /ПАРК В ОБОРОТЕ|Парк в обороте/i.test(t),
      load: /ЗАГРУЗКА|Загрузка/i.test(t),
    };
  });
  console.log("мобила:", JSON.stringify(mob));
  await ctx.shot("chk-strip-mobile", { jpeg: true });
}
