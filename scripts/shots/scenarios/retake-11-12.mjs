/**
 * Пересъёмка п.11-12 после правок: иконки вместо эмодзи, отметка электро
 * в начале строки, общий процент инвестора, крупные плашки в анкете.
 */
import { clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  // 1) Список аренд: отметка электро в начале строки
  await ctx.gotoRoute("rentals");
  await ctx.sleep(2200);
  const eb = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("tr")].filter((r) =>
      /Dio/.test(r.textContent || ""),
    );
    const row = rows.pop();
    row?.scrollIntoView({ block: "center" });
    return { found: !!row, text: (row?.textContent || "").slice(0, 90) };
  });
  console.log("rentals row:", JSON.stringify(eb));
  await ctx.sleep(700);
  await ctx.shot("p11-4-rentals", { jpeg: true });
  const rowClip = await clipOf(
    page,
    () => {
      const rows = [...document.querySelectorAll("tr")].filter((r) =>
        /Dio/.test(r.textContent || ""),
      );
      return rows.pop() ?? document.body;
    },
    8,
  );
  if (rowClip) await ctx.shot("p11-4-erow-crop", { clip: rowClip });

  // 2) Партнёрка: общий процент + персональные
  await ctx.gotoRoute("partners");
  await ctx.sleep(2500);
  const p = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      def: /по умолчанию/i.test(t),
      applyAll: /всем|Применить/i.test(t),
      dio: /Dio/.test(t),
    };
  });
  console.log("partners:", JSON.stringify(p));
  await ctx.shot("p11-1-partners", { jpeg: true });
  const defClip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (d) =>
            /по умолчанию/i.test(d.textContent || "") &&
            (d.textContent || "").length < 400,
        )
        .pop();
      return el ?? document.body;
    },
    12,
  );
  if (defClip) await ctx.shot("p11-0-default-share-crop", { clip: defClip });
  const tableClip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("table")].pop();
      return el ?? document.body;
    },
    10,
  );
  if (tableClip) await ctx.shot("p11-1-summary-crop", { clip: tableClip });

  // 3) Анкета: крупные плашки Бензин / Электро
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem(
      "hulk-application-draft",
      JSON.stringify({
        applicationId: null,
        uploadToken: null,
        expiresAt: null,
        fields: {},
        step: 4,
        uploadedKinds: [],
        savedAt: new Date().toISOString(),
      }),
    );
  });
  await page.goto("about:blank");
  await page.goto(ctx.base + "/#/apply", { waitUntil: "networkidle2" });
  await ctx.sleep(3500);
  const f1 = await page.evaluate(() => ({
    petrol: /Бензин/.test(document.body.innerText),
    electro: /Электро/.test(document.body.innerText),
    models: ["Jog", "Gear", "Dio"].filter((n) =>
      document.body.innerText.includes(n),
    ),
  }));
  console.log("apply petrol:", JSON.stringify(f1));
  await ctx.shot("p12-1-apply-petrol", { jpeg: true });
  const tgClip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (d) =>
            /Бензин/.test(d.textContent || "") &&
            /Электро/.test(d.textContent || "") &&
            (d.textContent || "").length < 200,
        )
        .pop();
      return el ?? document.body;
    },
    12,
  );
  if (tgClip) await ctx.shot("p12-3-toggle-crop", { clip: tgClip });

  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Электро/.test((x.textContent || "").trim()),
    );
    b?.click();
  });
  await ctx.sleep(1500);
  console.log(
    "apply electric:",
    JSON.stringify(
      await page.evaluate(() => ({
        models: ["Jog", "Gear", "Dio"].filter((n) =>
          document.body.innerText.includes(n),
        ),
      })),
    ),
  );
  await ctx.shot("p12-2-apply-electric", { jpeg: true });
}
