/**
 * 2.0.2: «Разделить» при открытии аренды на телефоне (шаг «Оплата»).
 * SUFFIX=was|now. Аренду не создаём — доходим до шага 4 и снимаем.
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const suffix = process.env.SUFFIX ?? "now";
  await page.setUserAgent(PHONE_UA);
  await page.setViewport({ width: Number(process.env.PHONE_W ?? 390), height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5500);
  const click = (re) =>
    page.evaluate((src) => {
      const rx = new RegExp(src);
      const b = [...document.querySelectorAll("button")].filter((x) => {
        const r = x.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && rx.test((x.textContent || "").trim());
      });
      const el = b.sort((a, c) => a.textContent.length - c.textContent.length)[0];
      el?.click();
      return el ? el.textContent.trim().slice(0, 40) : null;
    }, re.source);
  // FAB «Сделка» → «Скутер напрокат»
  console.log("fab:", await click(/^Сделка$/));
  await ctx.sleep(900);
  console.log("аренда:", await click(/Скутер напрокат/));
  await ctx.sleep(1500);
  // Шаг 1: первый клиент из списка
  const client = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^\+?\d[\d\s()-]{6,}$/.test(x.querySelector(".tabular-nums")?.textContent?.trim() ?? ""));
    b?.click();
    return b?.textContent?.trim().slice(0, 40) ?? null;
  });
  console.log("клиент:", client);
  await ctx.sleep(600);
  await click(/^Далее/);
  await ctx.sleep(900);
  // Шаг 2: первый свободный скутер
  const sc = await page.evaluate(() => {
    const box = [...document.querySelectorAll("div")].find((d) => d.className?.includes?.("min-h-[100dvh]"));
    const b = [...(box ?? document).querySelectorAll("button")].find((x) => /Jog|Gear|Dio|Tank|AIMA/.test(x.textContent || "") && x.getBoundingClientRect().height > 40);
    b?.click();
    return b?.textContent?.trim().slice(0, 40) ?? null;
  });
  console.log("скутер:", sc);
  await ctx.sleep(600);
  await click(/^Далее/);
  await ctx.sleep(700);
  await click(/^Далее/);
  await ctx.sleep(900);
  const hasSplit = await click(/^Разделить$/);
  console.log("разделить:", hasSplit);
  await ctx.sleep(500);
  await page.evaluate(() => document.querySelector("[data-rental-pay]")?.scrollIntoView({ block: "center" }));
  await ctx.sleep(400);
  const info = await page.evaluate(() => ({
    pay: document.querySelector("[data-rental-pay]")?.innerText.replace(/\n+/g, " | ") ?? null,
    heights: [...document.querySelectorAll("[data-rental-pay] button")].map((b) => Math.round(b.getBoundingClientRect().height)),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  console.log("оплата:", JSON.stringify(info));
  await ctx.shot(`v202-rent-pay-m${process.env.TAG ?? ""}-${suffix}`, { jpeg: true });
}
