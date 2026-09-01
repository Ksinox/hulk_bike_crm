/**
 * Продолжение пути: менеджер принимает заявку на покупку → клиент заведён →
 * по нему оформляется сделка продажи.
 */
const STAMP = String(process.env.SALE_STAMP || "").trim() || "Покупалов";

export async function run(page, ctx) {
  await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  await ctx.gotoRoute("sales");
  await ctx.sleep(2500);

  const text = () => page.evaluate(() => document.body.innerText);
  const click = async (re, tag = "button") =>
    page.evaluate(
      ({ re, tag }) => {
        const rx = new RegExp(re);
        const b = [...document.querySelectorAll(tag)].find(
          (x) => rx.test(x.textContent || "") && !x.disabled,
        );
        if (!b) return false;
        b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return true;
      },
      { re, tag },
    );

  // Открываем панель заявок и карточку
  await click("Заявки");
  await ctx.sleep(2200);
  await page.evaluate((stamp) => {
    const b = [...document.querySelectorAll("button,div[role=button],li")].find((x) =>
      (x.textContent || "").includes(stamp),
    );
    (b?.closest("button,[role=button],li") ?? b)?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
  }, STAMP);
  await ctx.sleep(2200);

  console.log("принять:", await click("Принять"));
  await ctx.sleep(3000);
  const afterAccept = await text();
  console.log(
    "после принятия:",
    afterAccept.slice(0, 260).split("\n").join(" / "),
  );
  await ctx.shot("v6-sale-accepted", { jpeg: true });

  // Если открылось окно оформления — подтверждаем
  if (/Оформить|Создать клиента|Сохранить/i.test(afterAccept)) {
    console.log("подтверждение:", await click("Оформить|Создать клиента|Сохранить"));
    await ctx.sleep(3000);
  }

  // Клиент должен появиться в разделе «Клиенты»
  await ctx.gotoRoute("clients");
  await ctx.sleep(2600);
  const inClients = await page.evaluate(
    (stamp) => document.body.innerText.includes(stamp),
    STAMP,
  );
  console.log("клиент заведён:", inClients);
  await ctx.shot("v6-sale-client", { jpeg: true });

  // И по нему можно начать сделку продажи
  await ctx.gotoRoute("sales");
  await ctx.sleep(2400);
  await click("Новая сделка");
  await ctx.sleep(1200);
  await click("Продажа");
  await ctx.sleep(2500);
  const wizard = await page.evaluate((stamp) => {
    const t = document.body.innerText;
    return {
      opened: /Шаг 1 из|Клиент/i.test(t),
      head: t.slice(0, 200).split("\n").join(" / "),
      canFindClient: t.includes(stamp),
    };
  }, STAMP);
  console.log("мастер продажи:", JSON.stringify(wizard).slice(0, 300));
  await ctx.shot("v6-sale-wizard", { jpeg: true });
}
