/** Кадры пунктов 19 (дашборд без дубля), 24 (счётчик клиентов), 6 (тариф). */
import { clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  // ── П.19: дашборд «Парк» — ряд KPI без «Активных аренд»
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2200);
  await ctx.shot("p19-after-dashboard");

  // ── П.24: клиенты — счётчик при фильтре
  await ctx.gotoRoute("clients");
  await ctx.sleep(1800);
  const clipAll = await clipOf(
    page,
    () => {
      const h = [...document.querySelectorAll("h1")].find(
        (e) => (e.textContent || "").trim() === "Клиенты",
      );
      return h?.parentElement ?? document.body;
    },
    12,
  );
  if (clipAll) await ctx.shot("p24-1-all-crop", { clip: clipAll });
  // выбрать фильтр «Долг» (чип/таб статуса)
  const picked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Долг" || /Долг/.test((x.textContent || "").trim()) && (x.textContent || "").length < 12,
    );
    b?.click();
    return b?.textContent?.trim();
  });
  await ctx.sleep(900);
  console.log("filter picked:", picked);
  const clipF = await clipOf(
    page,
    () => {
      const h = [...document.querySelectorAll("h1")].find(
        (e) => (e.textContent || "").trim() === "Клиенты",
      );
      return h?.parentElement ?? document.body;
    },
    12,
  );
  if (clipF) await ctx.shot("p24-2-filtered-crop", { clip: clipF });

  // ── П.6: новая аренда — свой тариф без мерцания
  await ctx.gotoRoute("rentals");
  await ctx.sleep(1200);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Новая аренда/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(1500);
  // выбрать клиента (первый в поиске) и скутер
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) =>
      /клиент/i.test(i.placeholder || ""),
    );
    if (inp) {
      const s = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      s.call(inp, "Морозов");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await ctx.sleep(900);
  await page.evaluate(() => {
    const opt = [...document.querySelectorAll("button,[role=option],div")].find(
      (e) =>
        /Павел Морозов/.test(e.textContent || "") &&
        (e.textContent || "").length < 80 &&
        e.closest("[class*=shadow], [class*=border]"),
    );
    opt?.click();
  });
  await ctx.sleep(800);
  // скутер: первый доступный в списке (кнопка с Jog/Gear)
  await page.evaluate(() => {
    const sc = [...document.querySelectorAll("button")].find(
      (b) =>
        /Jog|Gear/.test(b.textContent || "") &&
        (b.textContent || "").length < 120 &&
        !b.disabled,
    );
    sc?.click();
  });
  await ctx.sleep(900);
  // включить «Произвольный тариф»
  await page.evaluate(() => {
    const cb = [...document.querySelectorAll('input[type="checkbox"]')].find(
      (c) => /Произвольный тариф/.test(c.closest("label")?.textContent || ""),
    );
    cb?.click();
  });
  await ctx.sleep(800);
  await ctx.shot("p6-1-custom-on");
  // переключить ₽/нед
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "₽/нед",
    );
    b?.click();
  });
  await ctx.sleep(800);
  const clipTar = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("*")].find(
        (e) =>
          /Произвольный тариф/.test(e.textContent || "") &&
          (e.className || "").includes("border") &&
          (e.textContent || "").length < 300,
      );
      // блок тарифа + расчёт под ним
      return el?.parentElement ?? document.body;
    },
    12,
  );
  if (clipTar) await ctx.shot("p6-2-week-crop", { clip: clipTar });
  const nums = await page.evaluate(() => {
    const t = document.body.innerText;
    const rate = (t.match(/Ставка\s*([\d\s]+₽\/\w+)/) || [])[1];
    const sum = (t.match(/Итог\s*([\d\s]+)\s*₽/) || [])[1];
    return { rate, sum };
  });
  console.log("tariff:", JSON.stringify(nums));
}
