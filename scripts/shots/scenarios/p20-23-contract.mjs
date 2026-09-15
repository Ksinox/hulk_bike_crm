/** Пункты 20-23: печатная форма договора — новые пункты. */
import { API } from "./p9-common.mjs";

export async function run(page, ctx) {
  await page.goto(
    API(ctx.base) + "/api/rentals/34/document/contract_full?format=html",
    { waitUntil: "networkidle2" },
  );
  await ctx.sleep(1200);

  const grab = async (needle, name, pad = 14) => {
    const rect = await page.evaluate((n) => {
      const el = [...document.querySelectorAll("p")].find((e) =>
        (e.textContent || "").includes(n),
      );
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, needle);
    if (!rect) {
      console.log("MISS:", needle);
      return;
    }
    await ctx.sleep(400);
    // rect после scrollIntoView мог сдвинуться — берём заново
    const r2 = await page.evaluate((n) => {
      const el = [...document.querySelectorAll("p")].find((e) =>
        (e.textContent || "").includes(n),
      );
      const r = el.getBoundingClientRect();
      return {
        x: r.x + window.scrollX,
        y: r.y + window.scrollY,
        width: r.width,
        height: r.height,
      };
    }, needle);
    await ctx.shot(name, {
      clip: {
        x: Math.max(0, r2.x - pad),
        y: Math.max(0, r2.y - pad),
        width: r2.width + pad * 2,
        height: r2.height + pad * 2,
      },
    });
  };

  await grab("2.3.18.", "p20-oil-crop");
  await grab("2.3.19.", "p21-fuel-crop");
  await grab("согласно прайсу, установленному Арендодателем", "p22-price-crop");
  await grab("перерасчёт стоимости аренды не производится, и сумма", "p23-early-crop");

  // общий план первой страницы
  await page.evaluate(() => window.scrollTo(0, 0));
  await ctx.sleep(500);
  await ctx.shot("p20-23-contract-top", { jpeg: true });
}
