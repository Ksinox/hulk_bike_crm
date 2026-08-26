/** «БЫЛО» для 2.1: старая логика чипса на том же кейсе #43. */
import { clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(3000);
  const chip = await page.evaluate(() => {
    const t = document.body.innerText;
    return (t.match(/Поступит сегодня\s*\n\s*\+?[\d\s  ]+/) || [""])[0]
      .split("\n")
      .join(" ");
  });
  console.log("старый чипс:", JSON.stringify(chip), "— ждём 10 500");
  const clip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (d) =>
            /Поступит сегодня/.test(d.textContent || "") &&
            (d.textContent || "").length < 200,
        )
        .pop();
      return el ?? document.body;
    },
    10,
  );
  if (clip) await ctx.shot("v2-1-before-crop", { clip });
  await ctx.shot("v2-1-before", { jpeg: true });
}
