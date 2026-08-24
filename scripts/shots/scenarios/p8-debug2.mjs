/** Отладка п.8, шаг 2: включаем продление, смотрим спиннер дней и split. */
export async function run(page, ctx) {
  await ctx.gotoRoute("rentals", { rentalId: 34 });
  await ctx.sleep(1800);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Принять оплату",
    );
    b?.click();
  });
  await ctx.sleep(1500);
  // тумблер «Продлить аренду» — кликаем по строке/свитчу
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("button,[role=switch]")].find(
      (x) => /Продлить аренду/.test(x.textContent || ""),
    );
    el?.click();
  });
  await ctx.sleep(1200);
  const dump = await page.evaluate(() => ({
    split: document.body.innerText.includes("Разделить нал/безнал"),
    text: (document.body.innerText.match(/Продлить аренду[\s\S]{0,420}/) || [""])[0]
      .replace(/\n+/g, " · ")
      .slice(0, 420),
    inputs: [...document.querySelectorAll("input")].map((i) => ({
      v: i.value,
      ph: i.placeholder,
      type: i.type,
    })).slice(0, 10),
  }));
  console.log(JSON.stringify(dump, null, 1));
  await ctx.shot("p8-debug2", { jpeg: true });
}
