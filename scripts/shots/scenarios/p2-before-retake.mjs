/** Пересъёмка «было» пункта 2: аренда #39 уже существует (восстановлена). */
import { shotRevenueKpi, deleteViaUi, API } from "./p2-common.mjs";

export async function run(page, ctx) {
  const id = await page.evaluate(async (api) => {
    const rn = await fetch(api + "/api/rentals", { credentials: "include" }).then(
      (r) => r.json(),
    );
    const mine = (rn.items ?? rn ?? []).find((r) => r.clientId === 6);
    return mine?.id;
  }, API(ctx.base));
  if (!id) throw new Error("аренда не найдена");
  console.log("rental:", id);

  await shotRevenueKpi(page, ctx, "p2-before-1-revenue");
  await deleteViaUi(page, ctx, id);
  await shotRevenueKpi(page, ctx, "p2-before-2-revenue-same");

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
  console.log("restored:", id);
}
