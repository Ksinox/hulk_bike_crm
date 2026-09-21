/** Кто шире экрана в «Скутерах» на телефоне. */
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
export async function run(page, ctx) {
  await page.setUserAgent(PHONE_UA);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find((x)=>/Посмотрю позже|^Позже$/.test(x.textContent||"")); b?.click(); });
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);
  const report = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("*").forEach((el) => {
      if (el.scrollWidth - el.clientWidth > 8 && el.clientWidth > 0) {
        const kids = [...el.children].map((c) => `${c.tagName}:${Math.round(c.getBoundingClientRect().width)}:${(c.className||"").toString().slice(0,60)}`);
        out.push({ el: `${el.tagName} ${(el.className||"").toString().slice(0,80)}`, w: `${el.scrollWidth}>${el.clientWidth}`, kids: kids.slice(0, 6) });
      }
    });
    return out.slice(-3);
  });
  console.log(JSON.stringify(report, null, 1));
}
