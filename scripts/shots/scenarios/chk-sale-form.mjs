/** Анкета покупателя + окно «Отправить анкету». */
export async function run(page, ctx) {
  // 1. Окно отправки в «Заявках» — три канала и копирование
  await ctx.gotoRoute("applications");
  await ctx.sleep(2500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Отправить анкету/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1000);
  const dlg = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      wa: /WhatsApp/.test(t),
      tg: /Telegram/.test(t),
      max: /МАКС/.test(t),
      copyLink: /Скопировать ссылку/.test(t),
      copyText: /С текстом/.test(t),
    };
  });
  console.log("окно отправки:", JSON.stringify(dlg));
  await ctx.shot("v5-send-form", { jpeg: true });

  // МАКС-ветка
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /МАКС/.test(b.textContent || "") && b.querySelector("span"))?.click();
  });
  await ctx.sleep(700);
  console.log("МАКС:", await page.evaluate(() => ({
    explains: /не открывает чат по номеру/.test(document.body.innerText),
    copyBtn: /Скопировать сообщение/.test(document.body.innerText),
  })));
  await ctx.shot("v5-send-max", { jpeg: true });
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.getAttribute("aria-label") === "Закрыть")?.click();
  });
  await ctx.sleep(600);

  // 2. Анкета покупателя
  await page.goto(ctx.base + "/#/apply?p=sale", { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  const form = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      title: /Контактные данные/.test(t),
      sale: /оформить покупку/.test(t),
      steps: t.match(/Шаг (\d+) из (\d+)/)?.[0] ?? null,
      total: t.match(/из (\d+)/)?.[1] ?? null,
    };
  });
  console.log("анкета покупателя:", JSON.stringify(form));
  await ctx.shot("v5-sale-form", { jpeg: true });

  // Для сравнения — арендная
  await page.goto(ctx.base + "/#/apply", { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3000);
  const rent = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      rent: /оформить аренду/.test(t),
      total: t.match(/из (\d+)/)?.[1] ?? null,
    };
  });
  console.log("анкета аренды:", JSON.stringify(rent));
}
