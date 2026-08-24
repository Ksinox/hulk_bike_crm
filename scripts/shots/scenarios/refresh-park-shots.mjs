/**
 * Обновление ВСЕХ кадров лендинга, где виден блок обзора парка:
 * п.13 (сводка арендного пространства), п.15 (страница парка),
 * п.26 (проданные вне парка + переработанный блок), плюс мобильный вид.
 *
 * Правило заказчика 24.08: правишь интерфейс — сразу переснимай кадры
 * на лендинге, иначе там остаются старые.
 */
import { API, clipOf } from "./p9-common.mjs";

const overview = (page) =>
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
  // ── 1. Спокойное состояние: страница парка + кроп блока ──
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2600);
  const calm = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      total: (t.match(/(\d+)\s*\n\s*единиц/) || [])[1] ?? null,
      load: (t.match(/Загрузка \d+%/) || [""])[0],
      inRent: /В аренде/.test(t),
      zeros: /ДТП/.test(t) && /Разборка/.test(t),
      sold: /Проданы/.test(t),
    };
  });
  console.log("спокойное состояние:", JSON.stringify(calm));
  await ctx.shot("p15-1-fleet", { jpeg: true });
  await ctx.shot("p26-1-fleet-gone", { jpeg: true });
  let c = await overview(page);
  if (c) await ctx.shot("p26-2-kpi-crop", { clip: c });

  // ── 2. С проблемными статусами: ремонт + ДТП ──
  const ids = await page.evaluate(async (api) => {
    const items = await fetch(api + "/api/scooters", { credentials: "include" })
      .then((x) => x.json())
      .then((x) => x.items ?? x);
    const rentals = await fetch(api + "/api/rentals", { credentials: "include" })
      .then((x) => x.json())
      .then((x) => x.items ?? x);
    const busy = new Set(
      rentals.filter((r) => r.status === "active").map((r) => r.scooterId),
    );
    return items
      .filter((s) => s.baseStatus === "rental_pool" && !busy.has(s.id))
      .slice(0, 2)
      .map((s) => s.id);
  }, API(ctx.base));
  console.log("меняем статусы:", JSON.stringify(ids));
  if (ids[0]) await setStatus(page, ctx, ids[0], "repair");
  if (ids[1]) await setStatus(page, ctx, ids[1], "dtp");

  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(2500);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2400);
  const busyState = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      repair: /На ремонте/.test(t),
      dtp: /ДТП/.test(t),
      badge: /ТРЕБУЮТ РЕШЕНИЯ/i.test(t),
    };
  });
  console.log("с проблемами:", JSON.stringify(busyState));
  c = await overview(page);
  if (c) await ctx.shot("p26-4-overview-busy", { clip: c });

  // возвращаем как было
  if (ids[0]) await setStatus(page, ctx, ids[0], "rental_pool");
  if (ids[1]) await setStatus(page, ctx, ids[1], "rental_pool");

  // ── 3. Мобильный вид ──
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(2600);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2400);
  const mob = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      park: /ПАРК В ОБОРОТЕ/i.test(t),
      metrics: /В аренде/.test(t) && /Свободны/.test(t),
    };
  });
  console.log("мобила:", JSON.stringify(mob));
  await ctx.shot("p26-7-mobile-park", { jpeg: true });
}
