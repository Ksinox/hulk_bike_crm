/**
 * Проверка переработанного блока обзора парка: как он выглядит, когда
 * все статусы пустые и когда в них есть техника (ремонт / ДТП / разборка).
 */
import { API, clipOf } from "./p9-common.mjs";

async function setStatus(page, ctx, id, status) {
  return page.evaluate(
    async ({ api, id, status }) => {
      const v = await fetch(api + "/api/approvals/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "2626", action: "scooter_status_change" }),
      }).then((x) => x.json());
      const r = await fetch(api + "/api/scooters/" + id, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(v?.pass ? { "x-director-approval": "pass:" + v.pass } : {}),
        },
        body: JSON.stringify({ baseStatus: status }),
      });
      return r.status;
    },
    { api: API(ctx.base), id, status },
  );
}

export async function run(page, ctx) {
  const overview = () =>
    clipOf(
      page,
      () => {
        const el = [...document.querySelectorAll("section")]
          .filter((d) => /ПАРК В ОБОРОТЕ|Парк в обороте/i.test(d.textContent || ""))
          .pop();
        return el ?? document.body;
      },
      10,
    );

  // 1) как есть сейчас
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2400);
  let c = await overview();
  if (c) await ctx.shot("p26-2-kpi-crop", { clip: c });
  await ctx.shot("p26-1-fleet-gone", { jpeg: true });

  // 2) наполняем проблемные статусы — блок должен ожить
  const ids = await page.evaluate(async (api) => {
    const r = await fetch(api + "/api/scooters", { credentials: "include" }).then(
      (x) => x.json(),
    );
    const items = r.items ?? r;
    const free = items.filter((s) => s.baseStatus === "rental_pool");
    return free.slice(0, 2).map((s) => s.id);
  }, API(ctx.base));
  console.log("меняем статусы у:", JSON.stringify(ids));
  if (ids[0]) console.log("repair:", await setStatus(page, ctx, ids[0], "repair"));
  if (ids[1]) console.log("dtp:", await setStatus(page, ctx, ids[1], "dtp"));

  await page.reload({ waitUntil: "networkidle2" });
  await ctx.sleep(2200);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2400);
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      load: (t.match(/Загрузка \d+%/) || [""])[0],
      attention: /ТРЕБУЮТ РЕШЕНИЯ/i.test(t),
      repair: /На ремонте/.test(t),
      dtp: /ДТП/.test(t),
      sold: /Проданы/.test(t),
    };
  });
  console.log("блок:", JSON.stringify(st));
  c = await overview();
  if (c) await ctx.shot("p26-4-overview-busy", { clip: c });

  // 3) возвращаем как было
  if (ids[0]) await setStatus(page, ctx, ids[0], "rental_pool");
  if (ids[1]) await setStatus(page, ctx, ids[1], "rental_pool");
}
