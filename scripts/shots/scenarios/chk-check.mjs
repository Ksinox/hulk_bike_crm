/** Точечно: переключается ли своя галочка в форме клиента. */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  await page.setUserAgent(IPAD_UA);
  await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Посмотрю позже|^Позже$/.test(b.textContent || ""))?.click();
  });
  await ctx.gotoRoute("clients");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Клиент")?.click();
  });
  await ctx.sleep(1800);
  const before = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[role="checkbox"]')].find((x) =>
      /Фактический адрес совпадает/.test(x.textContent || ""),
    );
    return { есть: !!b, состояние: b?.getAttribute("aria-checked") };
  });
  console.log("до:", JSON.stringify(before));
  // настоящий тап по центру элемента
  const box = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[role="checkbox"]')].find((x) =>
      /Фактический адрес совпадает/.test(x.textContent || ""),
    );
    if (!b) return null;
    b.scrollIntoView({ block: "center" });
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (box) await page.mouse.click(box.x, box.y);
  await ctx.sleep(800);
  const after = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[role="checkbox"]')].find((x) =>
      /Фактический адрес совпадает/.test(x.textContent || ""),
    );
    return {
      состояние: b?.getAttribute("aria-checked"),
      полеФактического: document.body.innerText.includes("Фактический адрес"),
    };
  });
  console.log("после тапа:", JSON.stringify(after));
  await ctx.shot("chk-checkbox", { jpeg: true });
}
