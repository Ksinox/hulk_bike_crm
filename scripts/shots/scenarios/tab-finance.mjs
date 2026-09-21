/** Финансы на планшете: разделы снизу, действие — в нижней панели справа. */
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
  await ctx.sleep(6800);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Посмотрю позже|^Позже$/.test(b.textContent || ""))?.click();
  });
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
  });

  const tap = async (rx, pause = 1500) => {
    const box = await page.evaluate((src) => {
      const r = new RegExp(src);
      const el = [...document.querySelectorAll("button, [role=button], a")]
        .filter((x) => {
          const b = x.getBoundingClientRect();
          return b.width > 2 && b.height > 2 && r.test((x.textContent || "").trim());
        })
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, t: (el.textContent || "").trim().slice(0, 24) };
    }, rx.source);
    if (!box) return null;
    await page.mouse.click(box.x, box.y);
    await ctx.sleep(pause);
    return box.t;
  };

  await ctx.gotoRoute("finance");
  await ctx.sleep(2600);
  console.log("раздел «Расход»:", await tap(/^Расход$/));
  const state = await page.evaluate(() => {
    const t = document.body.innerText;
    const bottom = [...document.querySelectorAll("button")].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.top > window.innerHeight - 90 && r.width > 90;
    });
    return {
      своейКнопкиДобавить: /Расход за период[\s\S]{0,80}Добавить/.test(t),
      внизу: bottom.map((b) => (b.textContent || "").trim().slice(0, 20)),
    };
  });
  console.log("состояние:", JSON.stringify(state));
  await ctx.shot(`fin-tabs-${vp}`, { jpeg: true });

  // кнопка в нижней панели — самая правая внизу
  const hit = await page.evaluate(() => {
    const el = [...document.querySelectorAll("button")]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.top > window.innerHeight - 90 && r.width > 90;
      })
      .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: (el.textContent || "").trim() };
  });
  console.log("кнопка внизу:", hit && hit.t);
  if (hit) await page.mouse.click(hit.x, hit.y);
  await ctx.sleep(1800);
  const dlg = await page.evaluate(() => /Новый расход/.test(document.body.innerText));
  console.log("окно ввода открылось:", dlg);
  await ctx.shot(`fin-tabs-dialog-${vp}`, { jpeg: true });
}
