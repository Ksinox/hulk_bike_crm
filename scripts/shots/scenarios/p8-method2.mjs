/**
 * Пункт 8, смена формата оплаты из списка «Платежи за месяц» (Выручка):
 * платёж 4 200 ₽ (продление №34, наличные) → безнал. Проверяем метод,
 * журнал и разбивку нал/безнал.
 */
import { API, clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2500);
  // строка платежа 4 200 в «Платежи за месяц» + клик по бейджу «нал»
  const st = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("div")].filter(
      (d) =>
        /4[\s  ]200/.test(d.textContent || "") &&
        /нал/i.test(d.textContent || "") &&
        (d.textContent || "").length < 160,
    );
    const row = rows.pop();
    if (!row) return { found: false };
    row.scrollIntoView({ block: "center" });
    const badge = [...row.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim().toLowerCase() === "нал",
    );
    if (!badge) return { found: false, text: (row.textContent || "").slice(0, 90) };
    badge.click();
    return { found: true };
  });
  console.log("badge:", JSON.stringify(st));
  await ctx.sleep(800);
  await ctx.shot("p8-2-method-menu", { jpeg: true });
  const clip = await clipOf(
    page,
    () => {
      const rows = [...document.querySelectorAll("div")].filter(
        (d) =>
          /4[\s  ]200/.test(d.textContent || "") &&
          /Наличные/.test(d.textContent || "") &&
          (d.textContent || "").length < 300,
      );
      return rows.pop() ?? document.body;
    },
    16,
  );
  if (clip) await ctx.shot("p8-2-method-crop", { clip });

  // «Безнал»
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")]
      .filter((x) => (x.textContent || "").trim() === "Безнал")
      .pop();
    b?.click();
  });
  await ctx.sleep(2500);
  await ctx.shot("p8-3-changed", { jpeg: true });

  const check = await page.evaluate(async (api) => {
    const pays = await fetch(api + "/api/payments", { credentials: "include" })
      .then((x) => x.json());
    const p165 = (pays.items ?? pays).find((p) => p.id === 165);
    const act = await fetch(api + "/api/activity?limit=15", {
      credentials: "include",
    }).then((x) => x.json()).catch(() => null);
    const logItem = (act?.items ?? []).find(
      (i) => i.action === "payment_method_changed",
    );
    return {
      method165: p165?.method,
      log: logItem ? logItem.summary : null,
    };
  }, API(ctx.base));
  console.log("check:", JSON.stringify(check, null, 1));
}
