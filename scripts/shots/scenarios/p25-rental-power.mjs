/** Выбор категории бензин/электро при создании аренды (десктоп + мобила). */
import { clipOf } from "./p9-common.mjs";

async function openNewRental(page, ctx) {
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(1800);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Новая сделка/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(900);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Скутер напрокат/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(2000);
}

export async function run(page, ctx) {
  // Выбор категории показывается, только если СРЕДИ СВОБОДНЫХ есть оба
  // типа. На preview электро-Dio сейчас в аренде — заводим ещё одну
  // свободную электро-единицу, чтобы снять сценарий.
  const prep = await page.evaluate(async (api) => {
    const models = await fetch(api + "/api/scooter-models", {
      credentials: "include",
    })
      .then((x) => x.json())
      .then((x) => x.items ?? x);
    const el = models.find((m) => m.isElectric);
    if (!el) return { ok: false, reason: "нет электро-модели" };
    const scooters = await fetch(api + "/api/scooters", { credentials: "include" })
      .then((x) => x.json())
      .then((x) => x.items ?? x);
    // «свободна» = rental_pool И без активной аренды
    const rentals = await fetch(api + "/api/rentals", { credentials: "include" })
      .then((x) => x.json())
      .then((x) => x.items ?? x);
    const busy = new Set(
      rentals.filter((r) => r.status === "active").map((r) => r.scooterId),
    );
    const exists = scooters.find(
      (s) =>
        s.modelId === el.id && s.baseStatus === "rental_pool" && !busy.has(s.id),
    );
    if (exists) return { ok: true, reused: exists.name };
    const r = await fetch(api + "/api/scooters", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Dio #02",
        model: "honda",
        modelId: el.id,
        baseStatus: "rental_pool",
        vin: "TEST-ELECTRO-0002",
        mileage: 0,
      }),
    });
    return { ok: r.ok, status: r.status, model: el.name };
  }, "https://api-preview.104-128-128-96.sslip.io");
  console.log("подготовка:", JSON.stringify(prep));
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(2500);

  await openNewRental(page, ctx);
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      petrol: /Бензин/.test(t),
      electro: /Электро/.test(t),
      scooters: (t.match(/Свободн/i) || [""])[0],
    };
  });
  console.log("десктоп:", JSON.stringify(st));
  await ctx.shot("p25-7-rental-power", { jpeg: true });

  const zone = () =>
    clipOf(
      page,
      () => {
        const el = [...document.querySelectorAll("div")]
          .filter(
            (d) =>
              /Бензин/.test(d.textContent || "") &&
              /Электро/.test(d.textContent || "") &&
              /Все \(/.test(d.textContent || "") &&
              (d.textContent || "").length < 500,
          )
          .pop();
        return el ?? document.body;
      },
      12,
    );
  let c = await zone();
  if (c) await ctx.shot("p25-8-power-all", { clip: c });

  // выбрать «Электро» — должен остаться только электротранспорт
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Электро",
    );
    b?.click();
  });
  await ctx.sleep(900);
  const after = await page.evaluate(() => {
    const box = [...document.querySelectorAll("div")]
      .filter((d) => /Dio|Jog|Gear/.test(d.textContent || ""))
      .pop();
    return (box?.textContent || "").slice(0, 120);
  });
  console.log("после «Электро»:", JSON.stringify(after));
  c = await zone();
  if (c) await ctx.shot("p25-9-power-electric-crop", { clip: c });
  await ctx.shot("p25-9-power-electric", { jpeg: true });
}
