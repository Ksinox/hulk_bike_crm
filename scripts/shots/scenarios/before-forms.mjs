/**
 * Кадры «БЫЛО» для пунктов 25-26: старая форма добавления техники
 * (без выбора «Чья техника» и без иконок типа) и старое окно аренды
 * (в выборе скутера только модели, категории бензин/электро нет).
 * Снимается с локальной сборки старой версии, подключённой к preview-API.
 */
import { clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  // ── 1. Старое окно «Добавление в парк» ──
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2600);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Добавить скутер/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(2000);
  const form = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      opened: /Добавление в парк/.test(t),
      whose: /ЧЬЯ ТЕХНИКА/i.test(t),
      powerFilter: /Бензин/.test(t) && /Электро/.test(t),
      nameHint: (t.match(/ИМЯ:[^\n]*/) || [""])[0],
    };
  });
  console.log("старая форма:", JSON.stringify(form));
  await ctx.shot("p25-0-before-add", { jpeg: true });
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
  if (pickerClip) await ctx.shot("p25-0-before-picker", { clip: pickerClip });
  await page.keyboard.press("Escape");
  await ctx.sleep(800);

  // ── 2. Старое окно «Новая аренда» ──
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2000);
  const opened = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((x) =>
      /Новая сделка|Новая аренда/.test(x.textContent || ""),
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  await ctx.sleep(1000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Скутер напрокат/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(2200);
  const rental = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      opened: /Новая аренда/.test(t),
      hasPower: /Бензин/.test(t) && /Электро/.test(t),
      chips: (t.match(/Все \(\d+\)[^\n]*/) || [""])[0],
    };
  });
  console.log("старая аренда:", JSON.stringify(rental), "клик:", opened);
  await ctx.shot("p25-0-before-rental", { jpeg: true });
}
