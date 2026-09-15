/** Мастер продажи с клавиатуры: фокус и Enter. */
export async function run(page, ctx) {
  await ctx.gotoRoute("sales");
  await ctx.sleep(2600);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Новая сделка/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(700);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /^Продажа/.test((b.textContent || "").trim()))?.click();
  });
  await ctx.sleep(2000);

  const focus1 = await page.evaluate(() => ({
    step: document.body.innerText.match(/Шаг \d из 6/)?.[0],
    focused: document.activeElement?.getAttribute("placeholder") ?? null,
    hint: /Enter — дальше/.test(document.body.innerText),
  }));
  console.log("шаг 1:", JSON.stringify(focus1));

  // Печатаем имя, выбираем клиента, Enter
  await page.keyboard.type("Алексей");
  await ctx.sleep(900);
  await page.evaluate(() => {
    [...document.querySelectorAll("div.rounded-2xl.border button")][0]?.click();
  });
  await ctx.sleep(400);
  await page.keyboard.press("Enter");
  await ctx.sleep(2000);
  const step2 = await page.evaluate(() => ({
    step: document.body.innerText.match(/Шаг \d из 6/)?.[0],
    focused: document.activeElement?.getAttribute("placeholder") ?? null,
  }));
  console.log("после Enter:", JSON.stringify(step2));

  // Выбираем технику и Enter → шаг цены, поле суммы в фокусе
  await page.evaluate(() => {
    [...document.querySelectorAll("div.rounded-2xl.border button")][0]?.click();
  });
  await ctx.sleep(400);
  await page.keyboard.press("Enter");
  await ctx.sleep(1800);
  const step3 = await page.evaluate(() => ({
    step: document.body.innerText.match(/Шаг \d из 6/)?.[0],
    focused: document.activeElement?.getAttribute("placeholder") ?? null,
    value: document.activeElement?.value ?? null,
  }));
  console.log("шаг цены:", JSON.stringify(step3));
  await ctx.shot("v5-wizard-keyboard", { jpeg: true });

  // Чистим черновик
  await page.evaluate(async () => {
    const API = "https://api-preview.104-128-128-96.sslip.io";
    const r = await fetch(`${API}/api/sales/deals`, { credentials: "include" });
    const { items } = await r.json();
    for (const d of items) {
      if (d.status === "draft") {
        await fetch(`${API}/api/sales/deals/${d.id}`, {
          method: "DELETE",
          credentials: "include",
        });
      }
    }
  });
}
