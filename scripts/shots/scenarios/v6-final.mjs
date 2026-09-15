/** Кадры «стало» для отчёта: карточка клиента на узком, напоминания, платёж. */
export async function run(page, ctx) {
  // 1) Карточка клиента на узком экране
  await page.setViewport({ width: 900, height: 860, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3200);
  await ctx.gotoRoute("clients");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Алексей Смирнов/.test(b.textContent || ""))
      ?.click();
  });
  await ctx.sleep(1600);
  console.log(
    "клиент 900px:",
    await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        back: t.includes("Назад к списку"),
        listHidden: !t.includes("Павел Морозов"),
        overflowX:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        top: t.slice(t.indexOf("Клиенты"), t.indexOf("Клиенты") + 140).split("\n").join(" / "),
      };
    }),
  );
  await ctx.shot("v6-client-narrow", { jpeg: true });

  // 2) Напоминания на дашборде
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  await ctx.shot("v6-reminders", { jpeg: true });

  // 3) Окно платежа по выкупу
  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Выкупы")
      ?.click();
  });
  await ctx.sleep(1300);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Андрей Козлов/.test(b.innerText || ""))
      ?.click();
  });
  await ctx.sleep(1600);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Принять платёж/.test(b.textContent || ""))
      ?.click();
  });
  await ctx.sleep(900);
  console.log(
    "платёж:",
    await page.evaluate(() => {
      const t = document.body.innerText;
      const i = t.indexOf("Платёж по выкупу");
      return t.slice(i, i + 260).split("\n").join(" / ");
    }),
  );
  await ctx.shot("v6-buyout-payment", { jpeg: true });
}
