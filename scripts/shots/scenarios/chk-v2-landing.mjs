/** Проверка блока «Правки 2.0» на лендинге: пункты видны, истории открываются. */
export async function run(page, ctx) {
  await ctx.gotoRoute("progress");
  await ctx.sleep(2600);
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      block: /Правки 2\.0/.test(t),
      p21: /предполагаемые продления, а не история оплат/i.test(t) || /Поступит сегодня/.test(t),
      count: (t.match(/2\.\d+/g) || []).length,
    };
  });
  console.log("лендинг:", JSON.stringify(st));
  // открыть 2.1
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("button, div[role='button']")].find(
      (b) => /предполагаемые продления/.test(b.textContent || ""),
    );
    row?.scrollIntoView({ block: "center" });
    row?.click();
  });
  await ctx.sleep(1600);
  const imgs = await page.evaluate(() =>
    [...document.querySelectorAll("img")]
      .map((i) => i.getAttribute("src") || "")
      .filter((s) => /v2-/.test(s)),
  );
  console.log("кадры 2.1:", JSON.stringify(imgs));
  await ctx.shot("chk-v2-landing", { jpeg: true });
}
