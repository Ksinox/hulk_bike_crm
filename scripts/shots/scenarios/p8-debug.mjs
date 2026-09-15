/** Отладка п.8: что в окне «Принять оплату» у активной аренды №34. */
export async function run(page, ctx) {
  await ctx.gotoRoute("rentals", { rentalId: 34 });
  await ctx.sleep(1800);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Принять оплату",
    );
    b?.click();
  });
  await ctx.sleep(1800);
  const dump = await page.evaluate(() => ({
    buttons: [...document.querySelectorAll("button")]
      .map((b) => (b.textContent || "").trim().slice(0, 44))
      .filter(Boolean)
      .slice(-26),
    split: document.body.innerText.includes("Разделить нал/безнал"),
    text: (document.body.innerText.match(/Принять оплату[\s\S]{0,300}/) || [""])[0]
      .replace(/\n+/g, " · ")
      .slice(0, 300),
  }));
  console.log(JSON.stringify(dump, null, 1));
  await ctx.shot("p8-debug", { jpeg: true });
}
