/** Переиспользуется ли именованная вкладка при window.open(..., "noopener"). */
export async function run(page, ctx) {
  const browser = page.browser();
  const before = (await browser.pages()).length;

  // Вариант как сейчас в коде: с noopener
  await page.evaluate(() => {
    window.open("about:blank", "hulk_test_a", "noopener");
    window.open("about:blank", "hulk_test_a", "noopener");
  });
  await ctx.sleep(1500);
  const withNoopener = (await browser.pages()).length - before;

  // Вариант без noopener (имя должно работать)
  const mid = (await browser.pages()).length;
  await page.evaluate(() => {
    const a = window.open("about:blank", "hulk_test_b");
    if (a) a.opener = null;
    const b = window.open("about:blank", "hulk_test_b");
    if (b) b.opener = null;
  });
  await ctx.sleep(1500);
  const withoutNoopener = (await browser.pages()).length - mid;

  console.log("2 клика с noopener → новых вкладок:", withNoopener);
  console.log("2 клика без noopener → новых вкладок:", withoutNoopener);
}
