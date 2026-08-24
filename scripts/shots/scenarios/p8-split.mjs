/**
 * Пункт 8, живой тест «раздельная оплата»: аренда №34, продление 7 дней,
 * разбиение суммы на нал + безнал, проверка двух платежей.
 */
import { API, clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  await ctx.gotoRoute("rentals", { rentalId: 34 });
  await ctx.sleep(1800);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Принять оплату",
    );
    b?.click();
  });
  await ctx.sleep(1500);
  // тумблер продления: кнопка-switch (без текста) в блоке «Продлить аренду»
  const toggled = await page.evaluate(() => {
    const label = [...document.querySelectorAll("*")].find(
      (e) =>
        (e.textContent || "").trim().startsWith("Продлить аренду") &&
        (e.textContent || "").length < 120,
    );
    if (!label) return false;
    const host = label.closest("div")?.parentElement ?? label.parentElement;
    const sw = [...(host?.querySelectorAll("button") ?? [])].find(
      (b) => !(b.textContent || "").trim(),
    );
    sw?.click();
    return !!sw;
  });
  console.log("toggle clicked:", toggled);
  await ctx.sleep(1200);
  const st1 = await page.evaluate(() => ({
    split: document.body.innerText.includes("Разделить нал/безнал"),
    excerpt: (document.body.innerText.match(/К ПРИЁМУ[\s\S]{0,120}/) || [""])[0]
      .replace(/\n+/g, " · "),
  }));
  console.log("after toggle:", JSON.stringify(st1));

  // включаем разбиение
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Разделить нал\/безнал/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(900);
  // наличная часть = 1 500 (остальное безнал)
  await page.evaluate(() => {
    const label = [...document.querySelectorAll("label,div")].find(
      (e) =>
        /Наличными/.test(e.textContent || "") &&
        (e.textContent || "").length < 60 &&
        e.querySelector("input"),
    );
    const inp = label?.querySelector("input");
    if (!inp) return;
    const s = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    s.call(inp, "1500");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ctx.sleep(700);
  const st2 = await page.evaluate(() => ({
    cash: [...document.querySelectorAll("input")].map((i) => i.value),
    body: (document.body.innerText.match(/Разделить нал\/безнал[\s\S]{0,160}/) || [""])[0]
      .replace(/\n+/g, " · "),
  }));
  console.log("split state:", JSON.stringify(st2));
  await ctx.shot("p8-1-split", { jpeg: true });
  const clip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (e) =>
            /СПОСОБ ОПЛАТЫ/i.test(e.textContent || "") &&
            /Разделить/.test(e.textContent || "") &&
            (e.textContent || "").length < 400,
        )
        .pop();
      return el ?? document.body;
    },
    12,
  );
  if (clip) await ctx.shot("p8-1-split-crop", { clip });

  // Принять
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Принять",
    );
    b?.click();
  });
  await ctx.sleep(900);
  // подтверждение, если спросят
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Да, принять|Принять/.test((x.textContent || "").trim()),
    );
    b?.click();
  });
  await ctx.sleep(3500);

  // проверка: последние платежи аренды 34
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
