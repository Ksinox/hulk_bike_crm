/**
 * Фидбэк: три кнопки способа оплаты + живое раскрытие.
 * Долг создаём платежом, чтобы «К приёму» был > 0.
 */
import { API, clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  await page.evaluate(async (api) => {
    await fetch(api + "/api/payments", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rentalId: 41, type: "rent", amount: 4000,
        method: "cash", paid: false, note: "тест способа оплаты",
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

  const st0 = await page.evaluate(() => ({
    buttons: [...document.querySelectorAll("button")]
      .map((b) => (b.textContent || "").trim())
      .filter((t) => ["Наличные", "Перевод", "Разделить"].includes(t)),
  }));
  console.log("buttons:", JSON.stringify(st0));
  let c = await zone();
  if (c) await ctx.shot("fb-pay-1-idle", { clip: c });

  // Наличные
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Наличные",
    );
    b?.click();
  });
  await ctx.sleep(900);
  console.log("after cash:", await page.evaluate(() =>
    /Принимаем наличными/.test(document.body.innerText)));
  c = await zone();
  if (c) await ctx.shot("fb-pay-2-cash", { clip: c });

  // Разделить
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Разделить",
    );
    b?.click();
  });
  await ctx.sleep(900);
  const split = await page.evaluate(() => ({
    hasFields: /Наличными/.test(document.body.innerText) &&
      /Безналом/.test(document.body.innerText),
    hint: (document.body.innerText.match(/пройдут двумя платежами[^\n]*/) || [""])[0],
  }));
  console.log("after split:", JSON.stringify(split));
  c = await zone();
  if (c) await ctx.shot("fb-pay-3-split", { clip: c });
  await ctx.shot("fb-pay-4-full", { jpeg: true });
}
