/** Отладка п.4: что реально на экране после «Закрыть аренду». */
export async function run(page, ctx) {
  await ctx.gotoRoute("rentals", { rentalId: 35 });
  await ctx.sleep(1500);
  await page.evaluate(() => {
    const later = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim() === "Позже",
    );
    later?.click();
  });
  await ctx.sleep(600);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Закрыть аренду",
    );
    b?.click();
  });
  await ctx.sleep(1800);
  const dump = await page.evaluate(() => ({
    buttons: [...document.querySelectorAll("button")]
      .map((b) => (b.textContent || "").trim().slice(0, 50))
      .filter(Boolean)
      .slice(-30),
    hasPickerUpper: document.body.innerText.includes("ПРИЧИНА ВОЗВРАТА"),
    dialogTitles: [...document.querySelectorAll("h1,h2,h3")]
      .map((h) => (h.textContent || "").trim().slice(0, 60))
      .filter(Boolean),
  }));
  console.log(JSON.stringify(dump, null, 1));
  await ctx.shot("p4-debug-dialog");
}
