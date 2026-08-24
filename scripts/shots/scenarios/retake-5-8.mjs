/**
 * Пересъёмка кадров лендинга после правок заказчика 24.08:
 *  п.5 — меню «Новая сделка» (теперь «Выкуп» вместо «Рассрочки»);
 *  п.8 — три равнозначные кнопки способа оплаты + раскрытие «Разделить».
 */
import { API, clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  // ─── п.5: меню сделки ───
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(1600);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Новая сделка/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(900);
  const menu = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      header: /Что оформляем\?/.test(t),
      buyout: /Выкуп/.test(t),
      rassrochka: /Рассрочк/.test(t),
    };
  });
  console.log("p5 menu:", JSON.stringify(menu));
  await ctx.shot("p5-1-menu", { jpeg: true });
  const clipMenu = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (e) =>
            /Что оформляем\?/.test(e.textContent || "") &&
            /Ремонт/.test(e.textContent || "") &&
            (e.textContent || "").length < 600,
        )
        .pop();
      return el ?? document.body;
    },
    10,
  );
  if (clipMenu) await ctx.shot("p5-1-menu-crop", { clip: clipMenu });
  await page.keyboard.press("Escape");
  await ctx.sleep(600);

  // ─── п.8: способ оплаты ───
  await page.evaluate(async (api) => {
    await fetch(api + "/api/payments", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rentalId: 41,
        type: "rent",
        amount: 6000,
        method: "cash",
        paid: false,
        note: "пересъёмка п.8",
      }),
    });
  }, API(ctx.base));
  await page.reload({ waitUntil: "networkidle2" });
  await ctx.sleep(2000);
  await ctx.gotoRoute("rentals", { rentalId: 41 });
  await ctx.sleep(1800);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Принять оплату",
    );
    b?.click();
  });
  await ctx.sleep(1800);

  const zone = () =>
    clipOf(
      page,
      () => {
        const el = [...document.querySelectorAll("div")]
          .filter(
            (d) =>
              /Способ оплаты/i.test(d.textContent || "") &&
              /Разделить/.test(d.textContent || "") &&
              (d.textContent || "").length < 400,
          )
          .pop();
        return el ?? document.body;
      },
      14,
    );

  let c = await zone();
  if (c) await ctx.shot("p8-0-methods-crop", { clip: c });

  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Разделить",
    );
    b?.click();
  });
  await ctx.sleep(900);
  const split = await page.evaluate(() => ({
    fields: /Наличными/.test(document.body.innerText) &&
      /Безналом/.test(document.body.innerText),
    hint: (document.body.innerText.match(/двумя платежами[^\n]*/) || [""])[0],
  }));
  console.log("p8 split:", JSON.stringify(split));
  c = await zone();
  if (c) await ctx.shot("p8-1-split-crop", { clip: c });
  await ctx.shot("p8-1-split", { jpeg: true });
}
