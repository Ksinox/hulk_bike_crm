/**
 * Пункт 4: закрытие аренды с обязательной причиной возврата.
 * Кейс: №35 (Максим Орлов, долг 0). Проверяем: блокировку без причины,
 * свой вариант с сохранением в список, плашку в завершённой карточке.
 */
import { API, clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  // сброс справочника к дефолту (чистый прогон)
  await page.evaluate(async (api) => {
    await fetch(api + "/api/app-settings/return_reasons", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        value: JSON.stringify([
          "Уезжает в отпуск","Другая работа","Дорого",
          "Низкое качество аренды","Уходит с доставки",
        ]),
      }),
    });
  }, API(ctx.base));
  await ctx.gotoRoute("rentals", { rentalId: 35 });
  await ctx.sleep(1200);
  // всплывающая модалка «Новая заявка» (детектор) — закрываем «Позже»
  await page.evaluate(() => {
    const later = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim() === "Позже",
    );
    later?.click();
  });
  await ctx.sleep(600);
  await ctx.gotoRoute("rentals", { rentalId: 35 });
  await ctx.sleep(1600);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Закрыть аренду",
    );
    b?.click();
  });
  await ctx.sleep(1800);
  // приёмка: по каждой позиции выбираем «Без ущерба» — иначе кнопка
  // «Завершить аренду» неактивна (intake.blocked)
  const okClicks = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter(
      (x) => (x.textContent || "").trim() === "Без ущерба",
    );
    btns.forEach((b) => b.click());
    return btns.length;
  });
  console.log("no-damage clicks:", okClicks);
  await ctx.sleep(800);
  const hasPicker = await page.evaluate(() =>
    /причина возврата/i.test(document.body.innerText),
  );
  console.log("picker:", hasPicker);

  // 1) Пытаемся завершить БЕЗ причины → тост-блокировка
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Завершить аренду|Завершить/.test((x.textContent || "").trim()),
    );
    b?.click();
  });
  await ctx.sleep(1200);
  const blocked = await page.evaluate(() =>
    document.body.innerText.includes("Укажите причину возврата"),
  );
  console.log("blocked without reason:", blocked);
  await ctx.shot("p4-1-required");

  // 2) Свой вариант с сохранением
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Свой вариант/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(600);
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) =>
      /переехал/i.test(i.placeholder || ""),
    );
    if (!inp) return;
    const s = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    s.call(inp, "Переехал в другой город");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ctx.sleep(400);
  const clipPick = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("*")].find(
        (e) =>
          /Причина возврата/.test(e.textContent || "") &&
          /Свой вариант|Сохранить в список/.test(e.textContent || "") &&
          (e.textContent || "").length < 700,
      );
      return el ?? document.body;
    },
    12,
  );
  if (clipPick) await ctx.shot("p4-2-picker-crop", { clip: clipPick });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Выбрать",
    );
    b?.click();
  });
  await ctx.sleep(800);

  // 3) Завершаем
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Завершить аренду|Завершить/.test((x.textContent || "").trim()),
    );
    b?.click();
  });
  await ctx.sleep(4000);

  // 4) Карточка завершена: плашка причины
  await ctx.gotoRoute("rentals", { rentalId: 35 });
  await ctx.sleep(1600);
  const done = await page.evaluate(() => ({
    completed: document.body.innerText.includes("Причина возврата:"),
    text: (document.body.innerText.match(/Причина возврата:\s*[^\n]+/) || [])[0],
  }));
  console.log("result:", JSON.stringify(done));
  const clipDone = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("*")].find(
        (e) =>
          /Причина возврата:/.test(e.textContent || "") &&
          (e.textContent || "").length < 120,
      );
      return el ?? document.body;
    },
    12,
  );
  if (clipDone) await ctx.shot("p4-3-card-crop", { clip: clipDone });

  // 5) Причина сохранилась в справочник?
  const saved = await page.evaluate(async (api) => {
    const r = await fetch(api + "/api/app-settings/return_reasons", {
      credentials: "include",
    }).then((x) => x.json()).catch(() => null);
    return r?.value ?? null;
  }, API(ctx.base));
  console.log("saved list:", saved);
}
