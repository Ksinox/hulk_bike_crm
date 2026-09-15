/** Финальные кадры лендинга по партнёрке (2.5–2.9, состояние 27.08). */

async function clickTab(page, name) {
  await page.evaluate((n) => {
    const t = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim() === n,
    );
    t?.click();
  }, name);
}

/** Кроп блока по заголовку внутри него. */
async function blockClip(page, re, pad = 10) {
  return page.evaluate(
    ({ src, pad }) => {
      const rx = new RegExp(src);
      const blocks = [...document.querySelectorAll("div,section")].filter(
        (d) =>
          rx.test(d.textContent || "") &&
          d.className &&
          String(d.className).includes("rounded-2xl") &&
          (d.textContent || "").length < 1200,
      );
      const el = blocks[blocks.length - 1];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.max(0, r.x - pad),
        y: Math.max(0, r.y - pad),
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      };
    },
    { src: re, pad },
  );
}

export async function run(page, ctx) {
  await ctx.gotoRoute("partners");
  await ctx.sleep(2600);

  // 2.5 / 2.9: главная вкладка «Аренды» + дровер карточки внутри партнёрки
  await ctx.shot("v2-5-investors", { jpeg: true });
  await page.evaluate(() => {
    const tr = [...document.querySelectorAll("tr")].find((x) =>
      /#00\d\d/.test(x.textContent || ""),
    );
    tr?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await ctx.sleep(1800);
  await ctx.shot("v2-9-partner-rentals", { jpeg: true });
  await page.evaluate(() => {
    const hide = [...document.querySelectorAll("button")].find((b) =>
      /Скрыть/.test(b.textContent || ""),
    );
    hide?.click();
  });
  await ctx.sleep(600);

  // Инвесторы: список (2.8) и карточка (2.6/2.7)
  await clickTab(page, "Инвесторы");
  await ctx.sleep(1500);
  const listClip = await blockClip(page, "Добавить инвестора");
  if (listClip) await ctx.shot("v2-8-investors-crop", { clip: listClip });

  await page.evaluate(() => {
    const row = [...document.querySelectorAll("button")].find((b) =>
      /Волков/.test(b.textContent || ""),
    );
    row?.click();
  });
  await ctx.sleep(1800);
  await ctx.shot("v2-6-payouts", { jpeg: true });
  const payClip = await blockClip(page, "К ВЫПЛАТЕ СЕЙЧАС|Выплатить");
  console.log("payClip:", JSON.stringify(payClip));
  if (payClip) await ctx.shot("v2-6-payouts-crop", { clip: payClip });

  // 2.7: добавление техники из карточки инвестора (инвестор уже выбран)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Добавить технику/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(1400);
  const modal = await page.evaluate(() => ({
    partnerMode: /Добавление техники инвестора/.test(document.body.innerText),
    investorPicked: /Волков/.test(document.body.innerText),
  }));
  console.log("модалка добавления:", JSON.stringify(modal));
  await ctx.shot("v2-7-add-tech", { jpeg: true });
}
