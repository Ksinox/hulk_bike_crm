/** Правки 2.0, п.10: режимы блока «Скутеры» + выбор режима при добавлении. */
import { clipOf } from "./p9-common.mjs";

const clickTab = (page, label) =>
  page.evaluate((l) => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === l,
    );
    b?.click();
  }, label);

export async function run(page, ctx) {
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2600);

  const tabs = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      rental: /Аренда/.test(t),
      sale: /Продажа/.test(t),
      buyout: /Выкуп/.test(t),
      unassigned: /Не распределены/.test(t),
      models: /Модели/.test(t),
      title: (t.match(/ПАРК АРЕНДЫ|Парк аренды/i) || [""])[0],
    };
  });
  console.log("режимы:", JSON.stringify(tabs));
  await ctx.shot("v2-10-mode-rental", { jpeg: true });

  for (const [label, shot] of [
    ["Продажа", "v2-10-mode-sale"],
    ["Выкуп", "v2-10-mode-buyout"],
    ["Не распределены", "v2-10-mode-unassigned"],
  ]) {
    await clickTab(page, label);
    await ctx.sleep(1600);
    const st = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        head: (t.match(/(ПАРК АРЕНДЫ|НА ПРОДАЖУ|В ВЫКУПЕ|НЕ РАСПРЕДЕЛЕНЫ)/i) || [""])[0],
        count: (t.match(/(\d+)\s*\n?\s*единиц/) || [])[1] ?? null,
        rows: [...document.querySelectorAll('div[role="button"]')].filter((r) =>
          /Открыть/.test(r.textContent || ""),
        ).length,
      };
    });
    console.log(label, "→", JSON.stringify(st));
    await ctx.shot(shot, { jpeg: true });
  }

  // Добавление техники: выбор режима
  await clickTab(page, "Аренда");
  await ctx.sleep(1400);
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
      whereTo: /КУДА ДОБАВЛЯЕМ|Куда добавляем/i.test(t),
      cards: ["В аренду", "На продажу", "В выкуп", "Пока не решили"].filter((x) =>
        t.includes(x),
      ),
      state: /СОСТОЯНИЕ|Состояние/.test(t),
    };
  });
  console.log("форма добавления:", JSON.stringify(form));
  // Прокручиваем тело модалки к блоку выбора режима
  await page.evaluate(() => {
    const box = [...document.querySelectorAll("div")].find(
      (d) => d.scrollHeight > d.clientHeight + 40 && d.clientHeight > 260,
    );
    const target = [...document.querySelectorAll("label")].find((l) =>
      /куда добавляем/i.test(l.textContent || ""),
    );
    if (box && target) {
      box.scrollTop = Math.max(0, target.offsetTop - 120);
    }
  });
  await ctx.sleep(800);
  await ctx.shot("v2-10-add-modes", { jpeg: true });
  const clip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("label,div")]
        .filter(
          (d) =>
            /куда добавляем/i.test(d.textContent || "") &&
            /Пока не решили/.test(d.textContent || "") &&
            (d.textContent || "").length < 400,
        )
        .pop();
      return el ?? document.body;
    },
    12,
  );
  if (clip) await ctx.shot("v2-10-add-modes-crop", { clip });
}
