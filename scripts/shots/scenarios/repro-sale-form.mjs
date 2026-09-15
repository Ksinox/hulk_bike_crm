/**
 * Воспроизведение бага заказчика: анкета ПОКУПАТЕЛЯ (#/apply?p=sale)
 * не отправляется. Идём по всем шагам как живой человек.
 */
import fs from "node:fs";
import path from "node:path";

/** Минимальный валидный JPEG — для загрузки фото документов. */
function makeJpeg(dir, name) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) {
    // 1x1 JPEG
    const b64 =
      "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
    fs.writeFileSync(file, Buffer.from(b64, "base64"));
  }
  return file;
}

export async function run(page, ctx) {
  const tmp = process.env.TEMP || process.env.TMP || ".";
  const jpeg = makeJpeg(tmp, "hulk-doc.jpg");

  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  const base = page.url().split("/#")[0].replace(/\/$/, "");
  await page.goto(`${base}/#/apply?p=sale`, { waitUntil: "domcontentloaded" });
  // Смена только хеша не перезагружает SPA — форсим.
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  console.log("адрес:", page.url());

  /** Заполнить поле по плейсхолдеру (nth — если их несколько). */
  const fillPh = async (ph, value, nth = 0, exact = false) =>
    page.evaluate(
      ({ ph, value, nth, exact }) => {
        const els = [...document.querySelectorAll("input, textarea")].filter((e) => {
          const p = (e.placeholder || "").toLowerCase();
          const q = ph.toLowerCase();
          return exact ? p === q : p.includes(q);
        });
        const el = els[nth];
        if (!el) return `нет поля «${ph}» #${nth}`;
        const proto =
          el.tagName === "TEXTAREA"
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        el.focus();
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return "ok";
      },
      { ph, value, nth, exact },
    );

  const stepInfo = () =>
    page.evaluate(() => ({
      heading:
        document.querySelector("h1, h2")?.textContent?.trim().slice(0, 60) ?? "",
      inputs: [...document.querySelectorAll("input, textarea, select")].map(
        (e) => ({
          t: e.type || e.tagName,
          ph: e.placeholder || "",
          label:
            (e.closest("label")?.innerText || "").split("\n")[0].slice(0, 40) ||
            "",
        }),
      ),
      canNext: !![...document.querySelectorAll("button")].find(
        (b) => /Продолжить|Отправить/.test(b.textContent || "") && !b.disabled,
      ),
      hint: (document.body.innerText.match(/Проверьте:[^\n]*/) || [""])[0],
      buttons: [...document.querySelectorAll("button")]
        .map((b) => (b.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 8),
    }));

  const next = async () => {
    const ok = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => /Продолжить|Отправить|Далее/.test(x.textContent || "") && !x.disabled,
      );
      if (!b) return false;
      b.click();
      return true;
    });
    await ctx.sleep(1400);
    return ok;
  };

  const upload = async () => {
    const input = await page.$('input[type="file"]');
    if (!input) return "нет file input";
    await input.uploadFile(jpeg);
    await ctx.sleep(3500);
    return "загружено";
  };

  const log = [];
  for (let i = 0; i < 14; i++) {
    const info = await stepInfo();
    log.push(`${i}: ${info.heading} | ${info.buttons.join(" / ")}`);
    console.log(`ШАГ ${i}:`, JSON.stringify(info).slice(0, 500));

    const text = await page.evaluate(() => document.body.innerText);

    // Заполняем всё, что на шаге есть — по плейсхолдерам.
    const phs = info.inputs.map((x) => x.ph);
    if (phs.some((x) => /Иванович/i.test(x))) {
      await fillPh("Иванович", "Тестов Тест Тестович");
      await fillPh("+7 (", "+7 999 111-22-33", 0);
      await fillPh("ДД.ММ.ГГГГ", "01.01.1990");
    }
    for (const [ph, val, exact] of [
      ["0000", "1234", true],
      ["000000", "567890", true],
      ["000-000", "123-456", true],
      ["Например: ОУФМС", "ОУФМС России по Ростовской области", false],
      ["Город, улица, дом, квартира", "г. Ростов-на-Дону, ул. Тестовая, д. 1, кв. 2", true],
      ["адрес", "г. Ростов-на-Дону, ул. Тестовая, д. 1, кв. 2", false],
    ]) {
      const has = info.inputs.some((x) =>
        exact
          ? (x.ph || "").toLowerCase() === String(ph).toLowerCase()
          : (x.ph || "").toLowerCase().includes(String(ph).toLowerCase()),
      );
      if (has) console.log("  поле", ph, await fillPh(ph, val, 0, exact));
    }
    // Дата выдачи паспорта — та же маска, но не на шаге контактов.
    if (phs.some((x) => /ДД\.ММ/i.test(x)) && !phs.some((x) => /Иванович/i.test(x))) {
      console.log("  дата", await fillPh("ДД.ММ.ГГГГ", "01.01.2015"));
    }

    if (info.inputs.some((x) => x.t === "file")) {
      console.log("  фото:", await upload());
    }
    if (/узнали|источник/i.test(info.heading + text.slice(0, 300))) {
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) =>
          /Авито|Рекоменд|Инстаграм/i.test(x.textContent || ""),
        );
        b?.click();
      });
      await ctx.sleep(600);
    }

    // Галочка согласия на последнем шаге
    if (info.inputs.some((x) => x.t === "checkbox" && /персонал/i.test(x.label))) {
      await page.evaluate(() => {
        const cb = [...document.querySelectorAll("input[type=checkbox]")].find((c) =>
          /персонал/i.test(c.closest("label")?.innerText || ""),
        );
        if (cb && !cb.checked) cb.click();
      });
      await ctx.sleep(700);
    }

    await ctx.sleep(400);
    const moved = await next();
    if (!moved) {
      console.log("СТОП на шаге", i, JSON.stringify(await stepInfo()).slice(0, 400));
      break;
    }
    const after = await page.evaluate(() => document.body.innerText);
    if (/Спасибо|отправлена|Заявка принята/i.test(after)) {
      console.log("ГОТОВО:", after.slice(0, 200).split("\n").join(" / "));
      break;
    }
    if (/file:license|Не удалось|ошибк|Не хватает/i.test(after)) {
      const line = after
        .split("\n")
        .filter((l) => /file:|license|Не удалось|ошибк|Не хватает/i.test(l))
        .join(" | ");
      console.log("ОШИБКА-СТРОКА:", line);
      await ctx.shot("repro-sale-error", { jpeg: true });
      break;
    }
  }

  console.log("МАРШРУТ:\n" + log.join("\n"));
  await ctx.shot("repro-sale-form", { jpeg: true });
}
