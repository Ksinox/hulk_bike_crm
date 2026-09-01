/** Мобильные «Заявки»: аренда/покупка и своя ссылка на анкету. */
export async function run(page, ctx) {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4000);
  await ctx.gotoRoute("applications");
  await ctx.sleep(3000);

  const read = () => page.evaluate(() => {
    const t = document.body.innerText;
    return {
      hasSwitch: /Аренда/.test(t) && /Покупка/.test(t),
      sendLabel: [...document.querySelectorAll("button")]
        .map((b) => (b.textContent || "").trim())
        .find((x) => /Анкет|Отправить анкету/.test(x)) ?? "нет кнопки",
      rows: [...document.querySelectorAll("button")].filter((b) =>
        /Новая|Принята|Просмотрена|Отклонена/.test(b.textContent || ""),
      ).length,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  console.log("аренда:", JSON.stringify(await read()));
  await ctx.shot("v6-mobile-apps-rent", { jpeg: true });

  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => (b.textContent || "").trim().startsWith("Покупка"))
      ?.click();
  });
  await ctx.sleep(1500);
  console.log("покупка:", JSON.stringify(await read()));

  // Проверяем, какой адрес анкеты уходит
  console.log("ссылка:", await page.evaluate(() => {
    window.__opened = [];
    window.open = (u, n) => { window.__opened.push(String(u)); return { focus() {} }; };
    if (navigator.clipboard) navigator.clipboard.writeText = async (t) => { window.__clip = t; };
    const b = [...document.querySelectorAll("button")].find((x) => /Анкета покупателя/.test(x.textContent || ""));
    b?.click();
    return b ? "кнопка нажата" : "нет кнопки";
  }));
  await ctx.sleep(1500);
  console.log("окно анкеты:", await page.evaluate(() => {
    const t = document.body.innerText;
    const link = (t.match(/https?:\/\/[^\s]+apply[^\s]*/) || [])[0] || null;
    return { link, opened: window.__opened, clip: window.__clip ?? null };
  }));
  await ctx.shot("v6-mobile-apps-sale", { jpeg: true });
}
