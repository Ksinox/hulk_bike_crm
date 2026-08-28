/** Крупный план низа дровера карточки техники — не обрезан ли контент. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2600);
  await page.evaluate(() => {
    const open = [...document.querySelectorAll("button,a")].filter(
      (b) => (b.textContent || "").trim() === "Открыть",
    );
    open[0]?.click();
  });
  await ctx.sleep(2200);

  const info = await page.evaluate(() => {
    const main = [...document.querySelectorAll("main")].find(
      (m) => m.scrollHeight > m.clientHeight + 10,
    );
    if (!main) return null;
    main.scrollTop = main.scrollHeight;
    const last = main.lastElementChild;
    const lr = last ? last.getBoundingClientRect() : null;
    const mr = main.getBoundingClientRect();
    const t = main.innerText;
    const roi = [...main.querySelectorAll("section")].find((x) =>
      /Окупаемость и здоровье/.test(x.textContent || ""),
    );
    const tabs = [...main.querySelectorAll("div")].find((x) =>
      /История аренд/.test(x.textContent || "") && x.children.length <= 8,
    );
    const rr = roi ? roi.getBoundingClientRect() : null;
    const tr = tabs ? tabs.getBoundingClientRect() : null;
    return {
      children: main.children.length,
      roiRect: rr ? { top: Math.round(rr.top), h: Math.round(rr.height) } : null,
      tabsRect: tr ? { top: Math.round(tr.top), h: Math.round(tr.height) } : null,
      mainRect: { top: Math.round(main.getBoundingClientRect().top), h: Math.round(main.getBoundingClientRect().height) },
      scrollTop: Math.round(main.scrollTop),
      scrollH: main.scrollHeight,
      lastTag: last ? last.tagName + "." + String(last.className).slice(0, 40) : null,
      hasRoi: /Окупаемость/.test(t),
      hasTabs: /История аренд/.test(t),
      atBottom: Math.abs(main.scrollTop + main.clientHeight - main.scrollHeight) < 2,
      // Виден ли низ последнего блока внутри области дровера
      lastBottomInside: lr ? lr.bottom <= mr.bottom + 1 : null,
      gap: lr ? Math.round(mr.bottom - lr.bottom) : null,
      clip: { x: mr.x - 4, y: mr.y - 4, width: mr.width + 8, height: mr.height + 8 },
    };
  });
  console.log("низ дровера:", JSON.stringify(info && { ...info, clip: undefined }));
  await ctx.sleep(500);
  if (info?.clip) await ctx.shot("chk-drawer-bottom", { clip: info.clip });
}
