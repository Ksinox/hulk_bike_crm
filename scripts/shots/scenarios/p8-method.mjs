/**
 * Пункт 8, живой тест смены формата оплаты: платёж 4 200 ₽ (продление,
 * наличные) в карточке №34 меняем на безнал через мини-меню в таблице
 * платежей. Проверяем метод в БД, запись в журнале и «Сводку дня».
 */
import { API, clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  await ctx.gotoRoute("rentals", { rentalId: 34 });
  await ctx.sleep(1800);
  // секция «Финансовая информация» раскрыта по умолчанию — таблицу
  // платежей просто прокручиваем в поле зрения
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("tr")].find((r) =>
      /4 200/.test(r.textContent || ""),
    );
    row?.scrollIntoView({ block: "center" });
  });
  await ctx.sleep(800);
  const cell = await page.evaluate(() => {
    // строка платежа 4 200 → кнопка способа с карандашом
    const row = [...document.querySelectorAll("tr")].find((r) =>
      /4 200/.test(r.textContent || ""),
    );
    if (!row) return { found: false };
    const btn = [...row.querySelectorAll("button")].find((b) =>
      /наличные|безнал|перевод|карта/i.test(b.textContent || ""),
    );
    if (!btn) return { found: false, row: (row.textContent || "").slice(0, 80) };
    btn.click();
    return { found: true };
  });
  console.log("method cell:", JSON.stringify(cell));
  await ctx.sleep(800);
  await ctx.shot("p8-2-method-menu", { jpeg: true });
  const clip = await clipOf(
    page,
    () => {
      const row = [...document.querySelectorAll("tr")].find((r) =>
        /4 200/.test(r.textContent || ""),
      );
      return row ?? document.body;
    },
    40,
  );
  if (clip) await ctx.shot("p8-2-method-crop", { clip });

  // выбрать «Безнал»
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")]
      .filter((x) => (x.textContent || "").trim() === "Безнал")
      .pop();
    b?.click();
  });
  await ctx.sleep(2500);
  await ctx.shot("p8-3-changed", { jpeg: true });

  // проверки: метод в БД + запись журнала + сводка
  const check = await page.evaluate(async (api) => {
    const pays = await fetch(api + "/api/payments", { credentials: "include" })
      .then((x) => x.json());
    const p165 = (pays.items ?? pays).find((p) => p.id === 165);
    const act = await fetch(
      api + "/api/activity?limit=10",
      { credentials: "include" },
    ).then((x) => x.json()).catch(() => null);
    const logItem = (act?.items ?? []).find(
      (i) => i.action === "payment_method_changed",
    );
    return {
      method165: p165?.method,
      log: logItem
        ? { summary: logItem.summary, diff: logItem.meta?.diff?.method }
        : null,
    };
  }, API(ctx.base));
  console.log("check:", JSON.stringify(check, null, 1));
}
