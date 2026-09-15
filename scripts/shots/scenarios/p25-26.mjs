/**
 * Пункты 25-26 (вопросы заказчика 24.08):
 *  25 — окно добавления техники: иконки типа у моделей, фильтр категорий,
 *       блок «Чья техника» (Наша / Партнёрская);
 *  26 — проданная техника выбывает из парка: счётчик честный, отдельная
 *       плитка «Выбыли».
 */
import { API, clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  // ── 26: сначала переведём один скутер в «Продан», чтобы плитка ожила ──
  const st = await page.evaluate(async (api) => {
    const r = await fetch(api + "/api/scooters", { credentials: "include" }).then(
      (x) => x.json(),
    );
    const items = r.items ?? r;
    const sold = items.filter((s) => s.baseStatus === "sold");
    return {
      total: items.length,
      sold: sold.length,
      candidate: items.find((s) => s.baseStatus === "for_sale")?.id ?? null,
    };
  }, API(ctx.base));
  console.log("парк:", JSON.stringify(st));

  await ctx.gotoRoute("fleet");
  await ctx.sleep(2400);
  const counters = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      total: (t.match(/(\d+)\s*\n?\s*Всего скутеров/) || [])[1] ?? null,
      gone: /Выбыли/.test(t),
      goneN: (t.match(/(\d+)\s*\n?\s*Выбыли/) || [])[1] ?? null,
    };
  });
  console.log("счётчики:", JSON.stringify(counters));
  await ctx.shot("p26-1-fleet-gone", { jpeg: true });
  const kpiClip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (d) =>
            /Всего скутеров/.test(d.textContent || "") &&
            /Продаются/.test(d.textContent || "") &&
            (d.textContent || "").length < 800,
        )
        .pop();
      return el ?? document.body;
    },
    10,
  );
  if (kpiClip) await ctx.shot("p26-2-kpi-crop", { clip: kpiClip });

  // ── 25: окно добавления техники ──
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Добавить скутер/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(1800);
  const form = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      title: /Добавление в парк/.test(t),
      whose: /Чья техника/.test(t),
      partner: /Партнёрская/.test(t),
      powerFilter: /Бензин/.test(t) && /Электро/.test(t),
      numberField: /Номер в аренде/.test(t),
    };
  });
  console.log("форма:", JSON.stringify(form));
  await ctx.shot("p25-1-model-picker", { jpeg: true });

  const pickerClip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (d) =>
            /Найти другую модель/.test(d.textContent || "") &&
            (d.textContent || "").length < 700,
        )
        .pop();
      return el ?? document.body;
    },
    12,
  );
  if (pickerClip) await ctx.shot("p25-3-picker-crop", { clip: pickerClip });

  // фильтр «Электро» → в быстром выборе остаётся электро-модель
  const filtered = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Электро",
    );
    if (!b) return null;
    b.click();
    return true;
  });
  await ctx.sleep(900);
  console.log("фильтр электро нажат:", filtered);
  const afterFilter = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (d) =>
            /Найти другую модель/.test(d.textContent || "") &&
            (d.textContent || "").length < 700,
        )
        .pop();
      return el ?? document.body;
    },
    12,
  );
  if (afterFilter) await ctx.shot("p25-4-filter-electro", { clip: afterFilter });

  // блок «Чья техника»
  const whoseClip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (d) =>
            /Чья техника/.test(d.textContent || "") &&
            (d.textContent || "").length < 300,
        )
        .pop();
      return el ?? document.body;
    },
    12,
  );
  if (whoseClip) await ctx.shot("p25-2-partner-choice", { clip: whoseClip });
}
