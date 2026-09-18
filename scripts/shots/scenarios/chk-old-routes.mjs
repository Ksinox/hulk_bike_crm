/** Старые разделы (18.09): «Что нового» → «Развитие / Что уже сделано», «Хранилище» → «Настройки / Хранилище». */
export async function run(page, ctx) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  const where = () =>
    page.evaluate(() => ({
      dev: document.querySelector('[data-dev-tab][aria-selected="true"]')?.getAttribute("data-dev-tab") ?? null,
      settings: document.querySelector('[data-settings-tab][aria-selected="true"]')?.getAttribute("data-settings-tab") ?? null,
      h1: document.querySelector("h1")?.textContent?.trim().slice(0, 40),
      route: localStorage.getItem("hulk-route"),
    }));
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(1200);
  // колокольчик → «Открыть «Что уже сделано»»
  await page.evaluate(() => document.querySelector('button[aria-label="Что нового"]')?.click());
  await ctx.sleep(500);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Что уже сделано|Посмотреть улучшения/.test(b.textContent || ""))?.click());
  await ctx.sleep(1500);
  console.log("колокольчик →", JSON.stringify(await where()));
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(800);
  await ctx.gotoRoute("storage");
  await ctx.sleep(1500);
  console.log("старый «Хранилище» →", JSON.stringify(await where()));
  // сохранённый старый раздел после перезагрузки
  await page.evaluate(() => localStorage.setItem("hulk-route", "whats-new"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  console.log("сохранён «whats-new», F5 →", JSON.stringify(await where()));
}
