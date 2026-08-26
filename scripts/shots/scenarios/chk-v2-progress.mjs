/** Блок «Правки 2.0»: сколько пунктов готово, открываются ли истории. */
export async function run(page, ctx) {
  await ctx.gotoRoute("progress");
  await ctx.sleep(2800);
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    const done = (t.match(/Готово, на проверке/g) || []).length;
    const m = t.match(/Правки 2\.0[\s\S]{0,120}?(\d+)\/(\d+)/);
    return { doneTotal: done, block: m ? `${m[1]}/${m[2]}` : null };
  });
  console.log("лендинг:", JSON.stringify(st));
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find((e) =>
      /Правки 2\.0/.test(e.textContent || ""),
    );
    el?.scrollIntoView({ block: "start" });
  });
  await ctx.sleep(900);
  await ctx.shot("chk-v2-progress", { jpeg: true });
}
