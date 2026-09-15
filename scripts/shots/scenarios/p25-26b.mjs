/**
 * Пункты 25-26, вторая съёмка: скроллим форму до блока «Чья техника»,
 * а для плитки «Выбыли» переводим одну единицу в статус «Продан».
 */
import { API, clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  // ── подготовка: сделать один скутер проданным ──
  const prep = await page.evaluate(async (api) => {
    const r = await fetch(api + "/api/scooters", { credentials: "include" }).then(
      (x) => x.json(),
    );
    const items = r.items ?? r;
    const target =
      items.find((s) => s.baseStatus === "for_sale") ??
      items.find((s) => s.baseStatus === "ready");
    if (!target) return { ok: false, total: items.length };
    // Перевод в «Продан» защищён ключом директора (пункт 17) — берём pass.
    const v = await fetch(api + "/api/approvals/verify", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "2626", action: "scooter_status_change" }),
    }).then((x) => x.json());
    const res = await fetch(api + "/api/scooters/" + target.id, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(v?.pass ? { "x-director-approval": "pass:" + v.pass } : {}),
      },
      body: JSON.stringify({ baseStatus: "sold" }),
    });
    return {
      ok: res.ok,
      status: res.status,
      name: target.name,
      total: items.length,
    };
  }, API(ctx.base));
  console.log("подготовка:", JSON.stringify(prep));

  await page.reload({ waitUntil: "networkidle2" });
  await ctx.sleep(2200);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2400);
  const counters = await page.evaluate(() => {
    const t = document.body.innerText;
    const grab = (label) => {
      const re = new RegExp("(\\d+)\\s*\\n\\s*" + label);
      return (t.match(re) || [])[1] ?? null;
    };
    return {
      total: grab("Всего скутеров"),
      gone: grab("Выбыли"),
      hasGoneTile: /Выбыли/.test(t),
    };
  });
  console.log("счётчики парка:", JSON.stringify(counters));
  await ctx.shot("p26-1-fleet-gone", { jpeg: true });
  const kpiClip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (d) =>
            /Всего скутеров/.test(d.textContent || "") &&
            /Выбыли/.test(d.textContent || "") &&
            (d.textContent || "").length < 900,
        )
        .pop();
      return el ?? document.body;
    },
    10,
  );
  if (kpiClip) await ctx.shot("p26-2-kpi-crop", { clip: kpiClip });

  // список выбывших по клику на плитку
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("button, div[role='button'], div")]
      .filter(
        (d) =>
          /Выбыли/.test(d.textContent || "") &&
          (d.textContent || "").length < 80,
      )
      .pop();
    el?.click();
  });
  await ctx.sleep(1400);
  console.log(
    "список выбывших:",
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('div[role="button"]')].filter(
        (r) => /ПРОДАН/i.test(r.textContent || ""),
      );
      return rows.length;
    }),
  );
  await ctx.shot("p26-3-gone-list", { jpeg: true });

  // ── 25: форма добавления, прокрутка до «Чья техника» ──
  await ctx.gotoRoute("fleet");
  await ctx.sleep(1800);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Добавить скутер/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(1600);
  const scrolled = await page.evaluate(() => {
    const t = document.body.innerText;
    const box = [...document.querySelectorAll("div")].find(
      (d) => d.scrollHeight > d.clientHeight + 40 && d.clientHeight > 260,
    );
    if (box) box.scrollTop = box.scrollHeight;
    return {
      whose: /ЧЬЯ ТЕХНИКА/i.test(t),
      partner: /Партнёрская/.test(t),
      scrolledBox: !!box,
    };
  });
  console.log("форма:", JSON.stringify(scrolled));
  await ctx.sleep(700);
  await ctx.shot("p25-2-partner-choice", { jpeg: true });
  const whoseClip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (d) =>
            /Чья техника/i.test(d.textContent || "") &&
            (d.textContent || "").length < 300,
        )
        .pop();
      return el ?? document.body;
    },
    12,
  );
  if (whoseClip) await ctx.shot("p25-5-whose-crop", { clip: whoseClip });

  // нажимаем «Партнёрская» — подпись внизу должна это отразить
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim().startsWith("Партнёрская"),
    );
    b?.click();
  });
  await ctx.sleep(700);
  console.log(
    "подпись:",
    await page.evaluate(() =>
      (document.body.innerText.match(/Появится в парке[^\n]*/) || [""])[0],
    ),
  );
  await ctx.shot("p25-6-partner-selected", { jpeg: true });
}
