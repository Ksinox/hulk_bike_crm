/** Проверка «Развития»: 18 отдельных пунктов 2.32–2.49, кадры грузятся, вёрстка не едет. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  await ctx.gotoRoute("progress");
  await ctx.sleep(3500);
  // Модалка «Свежие правки» перекрывает страницу — закрываем.
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Позже/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1200);

  const info = await page.evaluate(() => {
    const t = document.body.innerText;
    const ids = (t.match(/\b2\.(3[2-9]|4[0-9])\b/g) || []);
    return {
      пунктов: [...new Set(ids)].sort().join(","),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log("список:", JSON.stringify(info));
  await ctx.shot("v9-landing-list", { jpeg: true });

  // раскрыть три пункта и проверить, что кадры процесса грузятся
  for (const [id, name] of [["2.41", "slot"], ["2.37", "application"], ["2.46", "contract"]]) {
    const opened = await page.evaluate((needle) => {
      const el = [...document.querySelectorAll("button, [role=button]")].find(
        (x) => (x.textContent || "").trim().startsWith(needle) && (x.textContent || "").length < 400,
      );
      if (!el) return false;
      el.scrollIntoView({ block: "center" });
      el.click();
      return true;
    }, id);
    await ctx.sleep(2500);
    const imgs = await page.evaluate(() => {
      const list = [...document.querySelectorAll("img")].filter((i) => /\/progress\//.test(i.getAttribute("src") || ""));
      return {
        всего: list.length,
        битых: list.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute("src")),
        подписи: list.map((i) => i.closest("figure, div")?.textContent?.trim().slice(0, 40)).filter(Boolean).slice(0, 6),
      };
    });
    console.log(`пункт ${id}:`, JSON.stringify({ раскрыт: opened, ...imgs }));
    await ctx.shot(`v9-landing-${name}`, { jpeg: true });
    await page.evaluate((needle) => {
      const el = [...document.querySelectorAll("button, [role=button], div")].find(
        (x) => (x.textContent || "").trim().startsWith(needle) && (x.textContent || "").length < 300,
      );
      el?.click();
    }, id);
    await ctx.sleep(800);
  }

  // мобила
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4000);
  await ctx.gotoRoute("progress");
  await ctx.sleep(3000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Позже/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1000);
  console.log("мобила:", JSON.stringify({
    overflowX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  }));
  await ctx.shot("v9-landing-mobile", { jpeg: true });
}
