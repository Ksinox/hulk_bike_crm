/** Страница настройки БЕЗ дополнения: честный статус и шаги установки. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1000, height: 900, deviceScaleFactor: 1 });
  const base = page.url().split("/#")[0].replace(/\/$/, "");
  await page.goto(`${base}/max-setup.html`, { waitUntil: "domcontentloaded" });
  await ctx.sleep(2000);
  console.log(await page.evaluate(() => ({
    flag: document.documentElement.dataset.hulkMaxHelper ?? null,
    status: document.getElementById("statusText")?.textContent?.trim(),
    installVisible: !document.getElementById("install")?.classList.contains("hidden"),
    zip: document.getElementById("installBtn")?.getAttribute("href"),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  })));
  // Проверка без дополнения должна честно ругаться
  await page.evaluate(() => {
    const i = document.getElementById("phone");
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(i, "+7 999 111-22-33");
    i.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("checkBtn").click();
  });
  await ctx.sleep(800);
  console.log("проверка:", await page.evaluate(() => document.getElementById("result")?.textContent));
  await ctx.shot("v6-max-setup", { jpeg: true });
}
