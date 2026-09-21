/** Отладка таблицы партнёрки: ширина таблицы и колонок против контейнера. */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const vp = process.env.VP ?? "land";
  await page.setUserAgent(IPAD_UA);
  await page.setViewport(
    vp === "port"
      ? { width: 820, height: 1180, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
      : { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  );
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Посмотрю позже|^Позже$/.test(b.textContent || ""))?.click();
  });
  await ctx.gotoRoute("partners");
  await ctx.sleep(2600);
  const info = await page.evaluate(() => {
    const table = document.querySelector("table");
    if (!table) return { таблица: false };
    const holder = table.parentElement;
    const cols = [...table.querySelectorAll("thead th")].map((th) => ({
      имя: (th.textContent || "").trim().slice(0, 14),
      ширина: Math.round(th.getBoundingClientRect().width),
      правый: Math.round(th.getBoundingClientRect().right),
    }));
    return {
      таблица: Math.round(table.getBoundingClientRect().width),
      контейнер: holder ? Math.round(holder.clientWidth) : null,
      экран: window.innerWidth,
      колонки: cols,
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await ctx.shot(`dbg-partners-${vp}`, { jpeg: true });
}
