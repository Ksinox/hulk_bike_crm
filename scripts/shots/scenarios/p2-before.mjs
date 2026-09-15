/**
 * Пункт 2 — «БЫЛО» (на СТАРОМ коде API): удаляем оплаченную аренду,
 * а выручка не меняется — деньги удалённой аренды продолжают числиться.
 */
import { createThrowaway, shotRevenueKpi, deleteViaUi, API } from "./p2-common.mjs";

export async function run(page, ctx) {
  const id = await createThrowaway(page, ctx);
  if (!id) throw new Error("аренда не создана");
  console.log("rental:", id);
  await ctx.sleep(600);

  // 1. Выручка ДО (с оплатой новой аренды)
  await shotRevenueKpi(page, ctx, "p2-before-1-revenue");

  // 2. Удаляем аренду через UI (ключ 2626)
  await deleteViaUi(page, ctx, id);

  // 3. Выручка ПОСЛЕ — та же сумма (баг)
  await shotRevenueKpi(page, ctx, "p2-before-2-revenue-same");

  // вернуть аренду для «стало»-прогона (старый unarchive флаги не трогает)
  await page.evaluate(
    async (api, rid) => {
      await fetch(api + `/api/rentals/${rid}/unarchive`, {
        method: "POST",
        credentials: "include",
      });
    },
    API(ctx.base),
    id,
  );
  console.log("restored for after-run:", id);
}
