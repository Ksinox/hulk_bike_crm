export async function run(page, ctx) {
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Журнал/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(2500);
  await ctx.shot("v5-journal", { jpeg: true });
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Рама и двигатель")?.click();
  });
  await ctx.sleep(1600);
  await ctx.shot("v5-journal-identity", { jpeg: true });
  console.log("identity:", await page.evaluate(() => ({
    rows: [...document.querySelectorAll("button")].filter((b) =>
      /→/.test(b.innerText || ""),
    ).length,
  })));
}
