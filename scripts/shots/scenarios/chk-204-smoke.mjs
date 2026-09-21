/** Дымовой обход разделов: ошибки в консоли и пустые экраны. PHASE=desk|phone|tablet */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ROUTES = ["dashboard", "rentals", "clients", "fleet", "sales", "service", "debtors", "rassrochki", "partners", "analytics", "docs", "staff", "settings", "progress"];
export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  if (phase === "phone") await page.setUserAgent(PHONE_UA);
  if (phase === "tablet") await page.setUserAgent(IPAD_UA);
  await page.setViewport(
    phase === "desk"
      ? { width: 1440, height: 900, deviceScaleFactor: 1 }
      : phase === "tablet"
        ? { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
        : { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  );
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${m.text()}`.slice(0, 160));
  });
  page.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message}`.slice(0, 160)));
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  // Закрываем показ обновления, если открылся
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Посмотрю позже|Позже/.test(x.textContent || ""));
    b?.click();
  });
  await ctx.sleep(800);
  for (const r of ROUTES) {
    await ctx.gotoRoute(r);
    await ctx.sleep(2200);
    const info = await page.evaluate(() => ({
      len: document.body.innerText.length,
      crash: /Что-то пошло не так|Ошибка приложения/.test(document.body.innerText),
    }));
    console.log(`${r}: текст ${info.len}${info.crash ? " · ЭКРАН ОШИБКИ" : ""}`);
  }
  const uniq = [...new Set(errors)];
  console.log("ошибок в консоли:", uniq.length);
  uniq.slice(0, 8).forEach((e) => console.log("  ·", e));
}
