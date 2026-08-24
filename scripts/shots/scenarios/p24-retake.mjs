/** Пункт 24: счётчик клиентов при фильтре «С долгом» → «N из M». */
import { clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  await ctx.gotoRoute("clients");
  await ctx.sleep(1800);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim().startsWith("С долгом"),
    );
    b?.click();
  });
  await ctx.sleep(900);
  const txt = await page.evaluate(
    () =>
      [...document.querySelectorAll("span")].find((s) =>
        /клиент/.test(s.textContent || ""),
      )?.textContent,
  );
  console.log("counter:", txt);
  const clip = await clipOf(
    page,
    () => {
      const h = [...document.querySelectorAll("h1")].find(
        (e) => (e.textContent || "").trim() === "Клиенты",
      );
      // шапка + строка фильтров ниже
      return h?.closest("header")?.parentElement ?? document.body;
    },
    0,
  );
  if (clip)
    await ctx.shot("p24-2-filtered-crop", {
      clip: { ...clip, height: Math.min(clip.height, 260) },
    });
}
