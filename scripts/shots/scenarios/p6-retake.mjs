/** Пункт 6: кадры «свой тариф» в модалке новой аренды (точные селекторы). */
import { clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  await ctx.gotoRoute("rentals");
  await ctx.sleep(1400);
  // Пункт 5 переименовал кнопку: «Новая сделка» → пункт списка «Аренда».
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Новая сделка/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(700);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Скутер напрокат/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(1600);
  // клиент: поле модалки «Кликните для списка…» → выбрать Морозова из списка
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) =>
      /Кликните для списка/.test(i.placeholder || ""),
    );
    inp?.click();
    inp?.focus();
  });
  await ctx.sleep(800);
  await page.evaluate(() => {
    const opt = [...document.querySelectorAll("button")].find(
      (b) =>
        /Павел Морозов/.test(b.textContent || "") &&
        (b.textContent || "").length < 90,
    );
    opt?.click();
  });
  await ctx.sleep(900);
  // скутер: карточка модалки (Jog #05 свободен)
  await page.evaluate(() => {
    const sc = [...document.querySelectorAll("button")].find(
      (b) =>
        /Jog|Gear/.test(b.textContent || "") &&
        /км|пробег|#/i.test(b.textContent || "") &&
        (b.textContent || "").length < 160 &&
        !b.disabled,
    );
    sc?.click();
  });
  await ctx.sleep(1000);
  // произвольный тариф
  const on = await page.evaluate(() => {
    const label = [...document.querySelectorAll("label")].find((l) =>
      /Произвольный тариф/.test(l.textContent || ""),
    );
    const cb = label?.querySelector('input[type="checkbox"]');
    cb?.click();
    return !!cb;
  });
  await ctx.sleep(800);
  console.log("custom on:", on);
  const info1 = await page.evaluate(() => {
    const rateInp = [...document.querySelectorAll("input")].find(
      (i) => i.placeholder === "3000",
    );
    const t = document.body.innerText;
    return {
      prefilled: rateInp?.value,
      stavka: (t.match(/Ставка\s*\n?\s*([\d\s]+₽\/\w+)/) || [])[1],
      itog: (t.match(/Итог\s*\n?\s*([\d\s]+)\s*₽/) || [])[1],
    };
  });
  console.log("after ON:", JSON.stringify(info1));
  const clip1 = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("label")].find((l) =>
        /Произвольный тариф/.test(l.textContent || ""),
      );
      let box = el?.closest("div.mt-3") ?? el?.parentElement;
      return box?.parentElement ?? document.body;
    },
    10,
  );
  if (clip1) await ctx.shot("p6-1-custom-crop", { clip: clip1 });

  // переключаем ₽/нед
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "₽/нед",
    );
    b?.click();
  });
  await ctx.sleep(800);
  const info2 = await page.evaluate(() => {
    const rateInp = [...document.querySelectorAll("input")].find(
      (i) => i.placeholder === "3000",
    );
    const t = document.body.innerText;
    return {
      rate: rateInp?.value,
      itog: (t.match(/Итог\s*\n?\s*([\d\s]+)\s*₽/) || [])[1],
    };
  });
  console.log("after WEEK:", JSON.stringify(info2));
  const clip2 = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("label")].find((l) =>
        /Произвольный тариф/.test(l.textContent || ""),
      );
      let box = el?.closest("div.mt-3") ?? el?.parentElement;
      return box?.parentElement ?? document.body;
    },
    10,
  );
  if (clip2) await ctx.shot("p6-2-week-crop", { clip: clip2 });
}
