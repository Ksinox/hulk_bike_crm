/** Проверка 28.08: список аренд партнёрки = RentalsList + бейдж инвестора. */
export async function run(page, ctx) {
  await ctx.gotoRoute("partners");
  await ctx.sleep(2800);
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      hasHeaders:
        /Клиент/.test(t) && /Скутер/.test(t) && /Долг/.test(t) && /Статус/.test(t),
      hasDays: /Дней/.test(t),
      hasInvestor: /Волков/.test(t),
      hasStatusPill: /активна|просрочка/i.test(t),
    };
  });
  console.log("список:", JSON.stringify(st));
  await ctx.shot("chk-plist-1", { jpeg: true });

  // Клик по строке → дровер
  await page.evaluate(() => {
    const tr = [...document.querySelectorAll("tr")].find((x) =>
      /#00\d\d/.test(x.textContent || ""),
    );
    tr?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await ctx.sleep(1800);
  const drawer = await page.evaluate(() => ({
    open: /Скрыть/.test(document.body.innerText),
    inPartners: /Партнёрка/.test(document.body.innerText),
  }));
  console.log("дровер:", JSON.stringify(drawer));
  await ctx.shot("chk-plist-2-drawer", { jpeg: true });
}
