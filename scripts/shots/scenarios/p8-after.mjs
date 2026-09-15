/** Пункт 8, кадры «после»: бейдж стал «безнал» + сводка дня с безналом. */
import { clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2500);
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll("div")].filter(
      (d) =>
        /4[\s  ]200/.test(d.textContent || "") &&
        /безнал/i.test(d.textContent || "") &&
        (d.textContent || "").length < 160,
    );
    rows.pop()?.scrollIntoView({ block: "center" });
  });
  await ctx.sleep(700);
  const clip = await clipOf(
    page,
    () => {
      const rows = [...document.querySelectorAll("div")].filter(
        (d) =>
          /4[\s  ]200/.test(d.textContent || "") &&
          /безнал/i.test(d.textContent || "") &&
          (d.textContent || "").length < 160,
      );
      return rows.pop() ?? document.body;
    },
    14,
  );
  if (clip) await ctx.shot("p8-4-after-crop", { clip });
  await ctx.shot("p8-4-after-full", { jpeg: true });

  // Сводка дня: безнал уже не 0
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => x.getAttribute("aria-label") === "Сводка дня",
    );
    b?.click();
  });
  await ctx.sleep(1200);
  const sums = await page.evaluate(() =>
    (document.body.innerText.match(/КАССА ЗА СУТКИ[\s\S]{0,200}/) || [""])[0]
      .replace(/\n+/g, " · ")
      .slice(0, 200),
  );
  console.log("day report:", sums);
  const clip2 = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (e) =>
            /Сводка дня/.test(e.textContent || "") &&
            /Итого за сутки/.test(e.textContent || "") &&
            (e.textContent || "").length < 700,
        )
        .pop();
      return el ?? document.body;
    },
    10,
  );
  if (clip2) await ctx.shot("p8-5-summary-crop", { clip: clip2 });
}
