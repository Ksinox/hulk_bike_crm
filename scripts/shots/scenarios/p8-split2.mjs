/**
 * Пункт 8, живой тест раздельной оплаты через долг:
 * создаём неоплаченный rent-платёж 3 000 ₽ у №34 → окно оплаты
 * показывает «К приёму 3 000» → разделяем 1 500 нал + 1 500 безнал →
 * принимаем → проверяем два платежа с разными методами.
 */
import { API, clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  // долг: неоплаченная аренда 3 000 ₽
  const created = await page.evaluate(async (api) => {
    const r = await fetch(api + "/api/payments", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rentalId: 34,
        type: "rent",
        amount: 3000,
        method: "cash",
        paid: false,
        note: "тест п.8 — раздельная оплата",
      }),
    }).then((x) => x.json());
    return r?.id ?? null;
  }, API(ctx.base));
  console.log("unpaid payment id:", created);

  // платёж создан мимо React-Query — перезагружаем SPA за свежим кэшем
  await page.reload({ waitUntil: "networkidle2" });
  await ctx.sleep(2000);
  await ctx.gotoRoute("rentals", { rentalId: 34 });
  await ctx.sleep(1800);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Принять оплату",
    );
    b?.click();
  });
  await ctx.sleep(1800);
  const st1 = await page.evaluate(() => ({
    due: (document.body.innerText.match(/К приёму[\s\S]{0,40}/i) || [""])[0]
      .replace(/\n+/g, " "),
    split: document.body.innerText.includes("Разделить нал/безнал"),
  }));
  console.log("state:", JSON.stringify(st1));

  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Разделить нал\/безнал/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(900);
  await ctx.shot("p8-1-split", { jpeg: true });
  const clip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (e) =>
            /Способ оплаты/i.test(e.textContent || "") &&
            /Безналом/.test(e.textContent || "") &&
            (e.textContent || "").length < 500,
        )
        .pop();
      return el ?? document.body;
    },
    12,
  );
  if (clip) await ctx.shot("p8-1-split-crop", { clip });

  // Принять (split 1500/1500 — дефолт пополам)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Принять",
    );
    b?.click();
  });
  await ctx.sleep(900);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Да, принять/.test((x.textContent || "").trim()),
    );
    b?.click();
  });
  await ctx.sleep(3500);

  const pays = await page.evaluate(async (api) => {
    const r = await fetch(api + "/api/payments", { credentials: "include" })
      .then((x) => x.json());
    const list = (r.items ?? r).filter((p) => p.rentalId === 34);
    return list.slice(-4).map((p) => ({
      id: p.id,
      type: p.type,
      amount: p.amount,
      method: p.method,
      paid: p.paid,
    }));
  }, API(ctx.base));
  console.log("last payments #34:", JSON.stringify(pays));
}
