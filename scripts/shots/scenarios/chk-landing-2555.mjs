/** Проверка новых пунктов 2.55–2.58 на «Развитии»: раскрываются, кадры грузятся. */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4000);
  await ctx.gotoRoute("progress");
  await ctx.sleep(3500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Позже/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1200);

  console.log("список:", JSON.stringify(await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      пункты: [...new Set(t.match(/\b2\.5[5-8]\b/g) || [])].sort().join(","),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  })));
  await S("l-01-list");

  for (const id of ["2.69", "2.70"]) {
    const opened = await page.evaluate((needle) => {
      const el = [...document.querySelectorAll("button, [role=button]")].find(
        (x) => (x.textContent || "").trim().startsWith(needle) && (x.textContent || "").length < 400,
      );
      if (!el) return false;
      el.scrollIntoView({ block: "center" });
      el.click();
      return true;
    }, id);
    await ctx.sleep(2800);
    const imgs = await page.evaluate(() => {
      const list = [...document.querySelectorAll("img")].filter((i) =>
        /\/progress\//.test(i.getAttribute("src") || ""),
      );
      return {
        всего: list.length,
        битых: list.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute("src")),
      };
    });
    console.log(`пункт ${id}:`, JSON.stringify({ раскрыт: opened, ...imgs }));
    await S(`l-${id.replace(".", "-")}`);
    await page.evaluate((needle) => {
      const el = [...document.querySelectorAll("button, [role=button]")].find(
        (x) => (x.textContent || "").trim().startsWith(needle) && (x.textContent || "").length < 400,
      );
      el?.click();
    }, id);
    await ctx.sleep(800);
  }
}
