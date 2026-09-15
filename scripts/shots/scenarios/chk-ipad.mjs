/**
 * Диагностика iPad + Safari (15.09): какая раскладка открывается и получают
 * ли поля фокус от касания пальцем. Safari на iPad выдаёт себя за Mac, поэтому
 * эмулируем именно его: десктопный UA + тач + ширина iPad.
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  const env = () =>
    page.evaluate(() => ({
      w: innerWidth,
      h: innerHeight,
      coarse: matchMedia("(pointer: coarse)").matches,
      hoverNone: matchMedia("(hover: none)").matches,
      touchPoints: navigator.maxTouchPoints,
      слой: document.querySelector("aside") ? "компьютерный (сайдбар)" : "телефонный",
    }));
  const tapInput = async (pick) => {
    const box = await page.evaluate((pick) => {
      const vis = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 20 && r.height > 10 && r.top >= 0 && r.bottom <= innerHeight;
      };
      const list = [...document.querySelectorAll("input, textarea")].filter(
        (i) => vis(i) && !["checkbox", "radio", "file", "hidden"].includes(i.type),
      );
      const el =
        pick === "search"
          ? list.find((i) => /поиск/i.test(i.placeholder || ""))
          : list[list.length > 1 ? 1 : 0];
      if (!el) return null;
      el.setAttribute("data-ipad-probe", "1");
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, ph: el.placeholder || el.name || el.type };
    }, pick);
    if (!box) return { найдено: false };
    // Ловим, не отменяет ли кто-то касание/нажатие (тогда фокуса не будет).
    await page.evaluate(() => {
      window.__prevented = [];
      for (const t of ["touchstart", "touchend", "pointerdown", "mousedown", "click"]) {
        window.addEventListener(t, (e) => {
          if (e.defaultPrevented) window.__prevented.push(t);
        });
      }
    });
    await page.touchscreen.tap(box.x, box.y);
    await ctx.sleep(600);
    return page.evaluate((ph) => {
      const a = document.activeElement;
      return {
        поле: ph,
        фокусНаПоле: !!a && a.getAttribute("data-ipad-probe") === "1",
        активный: a ? a.tagName + (a.placeholder ? `[${a.placeholder}]` : "") : null,
        отменены: window.__prevented,
        readOnly: a?.readOnly ?? null,
        inputMode: a?.inputMode ?? null,
        userSelect: a ? getComputedStyle(a).webkitUserSelect || getComputedStyle(a).userSelect : null,
      };
    }, box.ph);
  };

  for (const vp of [
    { name: "portrait", width: 820, height: 1180 },
    { name: "landscape", width: 1180, height: 820 },
    { name: "pro13-landscape", width: 1366, height: 1024 },
  ]) {
    await page.setUserAgent(IPAD_UA);
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(5000);
    console.log(vp.name, "среда:", JSON.stringify(await env()));
    await S(`ipad-${vp.name}-dashboard`);
    console.log(vp.name, "поиск:", JSON.stringify(await tapInput("search")));
  }

  // Форма «Новый клиент» на планшете-портрете: касание по полю.
  await page.setViewport({ width: 820, height: 1180, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  const btn = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Новый клиент/.test(x.textContent || ""));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  console.log("кнопка «Новый клиент»:", JSON.stringify(btn));
  if (btn) {
    await page.touchscreen.tap(btn.x, btn.y);
    await ctx.sleep(1500);
    await S("ipad-portrait-new-client");
    console.log("новый клиент, поле:", JSON.stringify(await tapInput("form")));
  }
}
