/** Диагностика кнопки «Ещё». */
export async function run(page, ctx) {
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2600);
  const dbg = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    const btns = aside ? [...aside.querySelectorAll("button")] : [];
    return {
      texts: btns.map((b) => (b.textContent || "").trim().slice(0, 22)),
    };
  });
  console.log(JSON.stringify(dbg, null, 1));
}
