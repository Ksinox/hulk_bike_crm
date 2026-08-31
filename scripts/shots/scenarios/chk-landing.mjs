/** Проверка лендинга «Развитие»: новые пункты и кадры. */
export async function run(page, ctx) {
  await ctx.gotoRoute("progress");
  await ctx.sleep(3500);
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    const imgs = [...document.images].filter((i) =>
      i.src.includes("/progress/"),
    );
    return {
      has219: /Блок «Продажи» — от витрины/.test(t),
      has220: /Меню: рабочее сверху/.test(t),
      has215: /Журнал техники: все действия/.test(t),
      imgs: imgs.length,
      broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
      overflowX:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log("лендинг:", JSON.stringify(st));
  await ctx.shot("chk-landing-top", { jpeg: true });

  // Скроллим к пункту 2.19
  const y = await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find((e) =>
      /^Блок «Продажи» — от витрины/.test((e.textContent || "").trim()),
    );
    if (!el) return null;
    el.scrollIntoView({ block: "start" });
    return Math.round(el.getBoundingClientRect().top);
  });
  await ctx.sleep(1500);
  console.log("2.19 найден:", y != null);
  await ctx.shot("chk-landing-sales", { jpeg: true });
}
