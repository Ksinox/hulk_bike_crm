/**
 * Пункт 2 — «СТАЛО» (на НОВОМ коде): то же удаление — выручка сразу
 * уменьшается на оплату аренды; в журнале самодостаточная запись.
 * Предполагает p2-before (аренда восстановлена и снова активна).
 */
import { shotRevenueKpi, deleteViaUi, API, clipOf } from "./p2-common.mjs";

export async function run(page, ctx) {
  const id = await page.evaluate(async (api) => {
    const rn = await fetch(api + "/api/rentals", { credentials: "include" }).then(
      (r) => r.json(),
    );
    const mine = (rn.items ?? rn ?? []).find((r) => r.clientId === 6);
    return mine?.id;
  }, API(ctx.base));
  if (!id) throw new Error("аренда Морозова не найдена — прогоните p2-before");
  console.log("rental:", id);

  // 1. Выручка ДО
  await shotRevenueKpi(page, ctx, "p2-after-1-revenue");

  // 2. Удаляем (ключ)
  await deleteViaUi(page, ctx, id);

  // 3. Выручка ПОСЛЕ — минус 3 500 ₽
  await shotRevenueKpi(page, ctx, "p2-after-2-revenue-dropped");

  // 4. Журнал: запись удаления с суммой и «подтверждено ключом директора»
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2200);
  const clip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("*")].find(
        (e) =>
          /из выручки исключено/.test(e.textContent || "") &&
          (e.textContent || "").length < 400,
      );
      let row = el;
      for (let i = 0; i < 6 && row; i++) {
        if ((row.className || "").includes("rounded")) break;
        row = row.parentElement;
      }
      return row ?? document.body;
    },
    12,
  );
  if (clip) await ctx.shot("p2-after-3-journal-crop", { clip });
}
