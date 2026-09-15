/**
 * Правки 2.0, п.5-9: рабочее пространство «Партнёрка».
 * Вкладки: Инвесторы (список + карточка с графиком выплат),
 * Электротранспорт, Аренды партнёрской техники.
 */
import { clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  await ctx.gotoRoute("partners");
  await ctx.sleep(2800);

  const tabs = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      investors: /Инвесторы/.test(t),
      fleet: /Электротранспорт/.test(t),
      rentals: /Аренды/.test(t),
      hasInvestor: /Волков/.test(t),
      units: (t.match(/(\d+) ед\./) || [])[1] ?? null,
    };
  });
  console.log("вкладки:", JSON.stringify(tabs));
  await ctx.shot("v2-5-investors", { jpeg: true });

  const listClip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (d) =>
            /Инвесторов/.test(d.textContent || "") &&
            /Размер инвестиций/.test(d.textContent || "") &&
            (d.textContent || "").length < 900,
        )
        .pop();
      return el ?? document.body;
    },
    10,
  );
  if (listClip) await ctx.shot("v2-8-investors-crop", { clip: listClip });

  // открыть карточку инвестора → график выплат
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("button")].find((b) =>
      /Волков/.test(b.textContent || ""),
    );
    row?.click();
  });
  await ctx.sleep(1800);
  const card = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      schedule: /График выплат/.test(t),
      current: /Текущий период/.test(t),
      rule: (t.match(/раз в (неделю|месяц)[^\n]*/i) || [""])[0],
      rows: (t.match(/отметить выплату/gi) || []).length,
      tech: /Техника инвестора/.test(t),
    };
  });
  console.log("карточка инвестора:", JSON.stringify(card));
  await ctx.shot("v2-6-payouts", { jpeg: true });
  const schedClip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (d) =>
            /График выплат/.test(d.textContent || "") &&
            (d.textContent || "").length < 1400,
        )
        .pop();
      return el ?? document.body;
    },
    10,
  );
  if (schedClip) await ctx.shot("v2-6-payouts-crop", { clip: schedClip });

  // вкладка «Аренды»
  // Кнопка вкладки, а не пункт сайдбара: ищем внутри контейнера вкладок
  await page.evaluate(() => {
    const bar = [...document.querySelectorAll("div")]
      .filter(
        (d) =>
          /Инвесторы/.test(d.textContent || "") &&
          /Электротранспорт/.test(d.textContent || "") &&
          (d.textContent || "").length < 80,
      )
      .pop();
    const b = [...(bar?.querySelectorAll("button") ?? [])].find(
      (x) => (x.textContent || "").trim() === "Аренды",
    );
    b?.click();
  });
  await ctx.sleep(1800);
  const rent = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      title: /Аренды партнёрской техники/.test(t),
      total: (t.match(/Всего аренд\s*\n?\s*(\d+)/) || [])[1] ?? null,
      hasRow: /Dio/.test(t),
    };
  });
  console.log("аренды партнёрки:", JSON.stringify(rent));
  await ctx.shot("v2-9-partner-rentals", { jpeg: true });

  // П.9: в общем списке аренд партнёрской техники быть не должно
  await ctx.gotoRoute("rentals");
  await ctx.sleep(2400);
  const mainList = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("tr, div[role='button']")]
      .map((r) => r.textContent || "")
      .filter((t) => /#00\d\d/.test(t));
    return {
      total: rows.length,
      hasDio: rows.some((t) => /Dio/.test(t)),
    };
  });
  console.log("общий список аренд:", JSON.stringify(mainList), "— Dio быть НЕ должно");
  await ctx.shot("v2-9-main-rentals", { jpeg: true });
}
