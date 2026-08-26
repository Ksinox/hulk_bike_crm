/** Правки 2.0, п.11: договор электровелосипеда (автоподстановка в карточке). */
export async function run(page, ctx) {
  const API = ctx.base.replace("crm-", "api-");
  // Сам документ — открываем печатную форму
  await page.goto(`${API}/api/rentals/41/document/contract_full_ebike?format=html`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await ctx.sleep(1800);
  const doc = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      h1: (t.match(/Договор проката[^\n]*/) || [""])[0],
      ebike: (t.match(/Электровелосипед/g) || []).length,
      scooter: (t.match(/[Сс]кутер/g) || []).length,
      charge: /заряженным аккумулятором/.test(t),
      zu: /штатным зарядным/.test(t),
    };
  });
  console.log("документ:", JSON.stringify(doc));
  await ctx.shot("v2-11-ebike-contract", { jpeg: true });

  // Автоподстановка: карточка аренды электрички предлагает этот договор
  await ctx.gotoRoute("rentals", { rentalId: 41 });
  await ctx.sleep(2400);
  const card = await page.evaluate(() => {
    const links = [...document.querySelectorAll("a,button")].map(
      (b) => b.getAttribute?.("href") || "",
    );
    return {
      hasEbikeLink: links.some((h) => /contract_full_ebike/.test(h)),
      docs: /Документы/.test(document.body.innerText),
    };
  });
  console.log("карточка:", JSON.stringify(card));
}
