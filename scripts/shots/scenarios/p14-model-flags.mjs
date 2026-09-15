/**
 * Пункт 14: флаги «Электро»/«Партнёрская» у модели каталога.
 * Модель Dio: включаем оба флага, сохраняем, проверяем бейджи на плитке.
 */
import { API } from "./p9-common.mjs";

export async function run(page, ctx) {
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2000);
  // вкладка «Модели»
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Модели",
    );
    b?.click();
  });
  await ctx.sleep(1500);
  // открыть модель Dio на редактирование (hover-кнопка) — жмём карандаш
  const opened = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button[title="Изменить"]')].find(
      (b) => {
        let el = b.parentElement;
        for (let i = 0; i < 6 && el; i++) {
          if ((el.textContent || "").includes("Dio")) return true;
          el = el.parentElement;
        }
        return false;
      },
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  console.log("edit opened:", opened);
  await ctx.sleep(1200);
  // включаем тумблеры «Электро» и «Партнёрская» — это label + checkbox
  const toggled = await page.evaluate(() => {
    let n = 0;
    for (const label of document.querySelectorAll("label")) {
      const t = (label.textContent || "").trim();
      if (!/^(Электро|Партнёрская)/.test(t) || t.length > 90) continue;
      const cb = label.querySelector('input[type="checkbox"]');
      if (cb && !cb.checked) {
        cb.click();
        n++;
      }
    }
    return n;
  });
  console.log("toggles clicked:", toggled);
  await ctx.sleep(600);
  await ctx.shot("p14-1-form", { jpeg: true });
  // сохранить
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Сохранить/.test((x.textContent || "").trim()),
    );
    b?.click();
  });
  await ctx.sleep(2000);
  await ctx.shot("p14-2-badges", { jpeg: true });
  const check = await page.evaluate(async (api) => {
    const r = await fetch(api + "/api/scooter-models", {
      credentials: "include",
    }).then((x) => x.json());
    const dio = (r.items ?? r).find((m) => m.name === "Dio");
    return { isElectric: dio?.isElectric, isPartner: dio?.isPartner };
  }, API(ctx.base));
  console.log("api:", JSON.stringify(check));
}
