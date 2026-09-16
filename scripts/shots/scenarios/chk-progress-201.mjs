/**
 * 2.0.1: группа «Выпуск 2.0.1» в «Развитии» (компьютер, телефон) и
 * «Кто посмотрел» с выбором выпуска в «Сотрудниках».
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const scrollToText = (re) =>
    page.evaluate((src) => {
      const rx = new RegExp(src);
      const el = [...document.querySelectorAll("h1,h2,h3,div,span,button")].find(
        (x) => x.children.length === 0 && rx.test(x.textContent || ""),
      );
      el?.scrollIntoView({ block: "start" });
      return !!el;
    }, re.source);
  const click = (re) =>
    page.evaluate((src) => {
      const rx = new RegExp(src);
      const el = [...document.querySelectorAll("button")].find((b) => rx.test((b.textContent || "").trim()));
      el?.click();
      return el ? el.textContent.trim().slice(0, 40) : null;
    }, re.source);

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("progress");
  await ctx.sleep(2500);
  await click(/^Позже$/);
  await ctx.sleep(500);
  console.log("группа:", await scrollToText(/^Выпуск 2\.0\.1$/));
  await ctx.sleep(600);
  await ctx.shot("chk-progress-201-d", { jpeg: true });
  console.log("пункт:", await click(/Партия техники за один раз/));
  await ctx.sleep(1500);
  await ctx.shot("chk-progress-201-d-item", { jpeg: true });
  await page.keyboard.press("Escape");

  await ctx.gotoRoute("staff");
  await ctx.sleep(2500);
  console.log("панель:", await scrollToText(/кто посмотрел/));
  await ctx.sleep(500);
  await ctx.shot("chk-views-201", { jpeg: true });
  console.log("выпуск 2.0:", await click(/^2\.0$/));
  await ctx.sleep(1200);
  const title = await page.evaluate(() => [...document.querySelectorAll("h2")].find((h) => /кто посмотрел/.test(h.textContent))?.textContent);
  console.log("заголовок:", title);

  await page.setUserAgent(PHONE_UA);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("progress");
  await ctx.sleep(2500);
  await click(/^Позже$/);
  await ctx.sleep(500);
  console.log("телефон, группа:", await scrollToText(/^Выпуск 2\.0\.1$/));
  await ctx.sleep(600);
  await ctx.shot("chk-progress-201-m", { jpeg: true });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log("переполнение по ширине:", ov);
}
