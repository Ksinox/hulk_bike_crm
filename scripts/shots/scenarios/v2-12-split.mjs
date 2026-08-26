/** Правки 2.0, п.12: разделение выручки наше / партнёрское / инвестору. */
import { clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2800);
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      own: /наша техника/i.test(t),
      partner: /партнёрская/i.test(t),
      investor: /инвестору/i.test(t),
      line: (t.match(/наша техника[^\n]*/i) || [""])[0],
    };
  });
  console.log("разбивка:", JSON.stringify(st));
  const clip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (d) =>
            /Выручка/.test(d.textContent || "") &&
            /инвестору/i.test(d.textContent || "") &&
            (d.textContent || "").length < 500,
        )
        .pop();
      return el ?? document.body;
    },
    10,
  );
  if (clip) await ctx.shot("v2-12-split-crop", { clip });
  await ctx.shot("v2-12-split", { jpeg: true });
}
