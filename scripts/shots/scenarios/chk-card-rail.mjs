export async function run(page, ctx) {
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2600);
  await page.evaluate(() => {
    [...document.querySelectorAll("button,a")]
      .filter((b) => (b.textContent || "").trim() === "Открыть")[0]?.click();
  });
  await ctx.sleep(2000);
  const st = await page.evaluate(() => {
    const nav = document.querySelector("nav.sticky");
    return {
      rail: !!nav,
      railW: nav ? Math.round(nav.getBoundingClientRect().width) : null,
      items: nav ? nav.querySelectorAll("button").length : 0,
      hScroll: [...document.querySelectorAll("div")].some(
        (d) => d.scrollWidth > d.clientWidth + 4 && /Обзор|Аренды/.test(d.innerText || ""),
      ),
    };
  });
  console.log("панель:", JSON.stringify(st));
  await ctx.shot("chk-card-rail", { jpeg: true });

  await page.evaluate(() => {
    const nav = document.querySelector("nav.sticky");
    [...(nav?.querySelectorAll("button") || [])].find((b) =>
      /Ремонты/.test(b.textContent || ""),
    )?.click();
  });
  await ctx.sleep(1200);
  await ctx.shot("chk-card-rail-repairs", { jpeg: true });
  console.log("раздел:", await page.evaluate(() => ({
    active: [...document.querySelectorAll("nav.sticky button")].find((b) =>
      b.className.includes("bg-ink"),
    )?.innerText,
  })));
}
