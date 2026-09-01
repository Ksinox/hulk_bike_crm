/**
 * Весь путь заявки на покупку: клиент заполняет анкету → отправляет →
 * менеджер видит её в «Продажах» → открывает карточку.
 */
import fs from "node:fs";
import path from "node:path";

function makeJpeg(dir, name) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) {
    const b64 =
      "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
    fs.writeFileSync(file, Buffer.from(b64, "base64"));
  }
  return file;
}

/** Уникальное имя — чтобы заявку было видно в списке среди прочих. */
const STAMP = String(process.env.SALE_STAMP || "").trim() || "Проверкин";

export async function run(page, ctx) {
  const tmp = process.env.TEMP || process.env.TMP || ".";
  const jpeg = makeJpeg(tmp, "hulk-doc.jpg");
  const base = page.url().split("/#")[0].replace(/\/$/, "");

  /* ============ ЧАСТЬ 1. Клиент заполняет анкету покупателя ============ */
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${base}/#/apply?p=sale`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);

  const fillPh = async (ph, value, exact = false) =>
    page.evaluate(
      ({ ph, value, exact }) => {
        const el = [...document.querySelectorAll("input, textarea")].find((e) => {
          const p = (e.placeholder || "").toLowerCase();
          const q = ph.toLowerCase();
          return exact ? p === q : p.includes(q);
        });
        if (!el) return `нет поля «${ph}»`;
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
      { ph, value, exact },
    );

  const info = () =>
    page.evaluate(() => ({
      heading: document.querySelector("h1, h2")?.textContent?.trim() ?? "",
      phs: [...document.querySelectorAll("input, textarea")].map(
        (e) => e.placeholder || "",
      ),
      hasFile: !!document.querySelector('input[type="file"]'),
      hasConsent: !![...document.querySelectorAll("input[type=checkbox]")].find(
        (c) => /персонал/i.test(c.closest("label")?.innerText || ""),
      ),
      isSource: /узнали/i.test(document.body.innerText.slice(0, 400)),
    }));

  const next = async () => {
    const ok = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (x) =>
          /Продолжить|Далее|Готово|Отправить заявку/.test(x.textContent || "") &&
          !x.disabled,
      );
      if (!b) return false;
      b.click();
      return true;
    });
    await ctx.sleep(1600);
    return ok;
  };

  const steps = [];
  let done = false;
  for (let i = 0; i < 12; i++) {
    const st = await info();
    steps.push(st.heading);

    if (st.phs.some((x) => /Иванович/i.test(x))) {
      await fillPh("Иванович", `${STAMP} Пётр Сергеевич`);
      await fillPh("+7 (", "+7 999 111-22-33");
      await fillPh("ДД.ММ.ГГГГ", "01.01.1990");
    } else if (st.phs.some((x) => x === "0000")) {
      await fillPh("0000", "1234", true);
      await fillPh("000000", "567890", true);
      await fillPh("000-000", "123-456", true);
      await fillPh("Например: ОУФМС", "ОУФМС России по Ростовской области");
      await fillPh(
        "Город, улица, дом, квартира",
        "г. Ростов-на-Дону, ул. Тестовая, д. 1",
        true,
      );
      await fillPh("ДД.ММ.ГГГГ", "01.01.2015");
    } else if (st.phs.some((x) => /Город, улица/i.test(x))) {
      await fillPh("Город, улица", "г. Ростов-на-Дону, ул. Тестовая, д. 1");
    }

    if (st.hasFile) {
      const input = await page.$('input[type="file"]');
      await input.uploadFile(jpeg);
      await ctx.sleep(5000);
    }
    if (st.isSource) {
      await page.evaluate(() => {
        [...document.querySelectorAll("button")]
          .find((x) => /Авито/i.test(x.textContent || ""))
          ?.click();
      });
      await ctx.sleep(600);
    }
    if (st.hasConsent) {
      await page.evaluate(() => {
        const cb = [...document.querySelectorAll("input[type=checkbox]")].find((c) =>
          /персонал/i.test(c.closest("label")?.innerText || ""),
        );
        if (cb && !cb.checked) cb.click();
      });
      await ctx.sleep(700);
    }

    if (!(await next())) {
      console.log("НЕ ПРОЙТИ ДАЛЬШЕ на шаге:", st.heading);
      break;
    }
    const after = await page.evaluate(() => document.body.innerText);
    if (/Спасибо|заявка отправлена|Заявка принята|свяжемся/i.test(after)) {
      done = true;
      console.log("ОТПРАВЛЕНО:", after.slice(0, 160).split("\n").join(" / "));
      break;
    }
    const err = after
      .split("\n")
      .find((l) => /Не хватает|Не заполнены|Не удалось/i.test(l));
    if (err) {
      console.log("ОШИБКА:", err);
      await ctx.shot("check-sale-error", { jpeg: true });
      break;
    }
  }
  console.log("ШАГИ АНКЕТЫ:", steps.join(" → "));
  console.log("ИТОГ ОТПРАВКИ:", done ? "успех" : "не отправлено");
  await ctx.shot("v6-sale-form-done", { jpeg: true });
  if (!done) return;

  /* ============ ЧАСТЬ 2. Менеджер видит заявку в «Продажах» ============ */
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  await ctx.gotoRoute("sales");
  await ctx.sleep(2500);

  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Заявки/.test(x.textContent || ""),
    );
    if (!b) return "нет кнопки «Заявки»";
    b.click();
    return "ок";
  });
  await ctx.sleep(2200);
  console.log("панель заявок:", opened);

  const found = await page.evaluate((stamp) => {
    const t = document.body.innerText;
    return { visible: t.includes(stamp), head: t.slice(0, 220).split("\n").join(" / ") };
  }, STAMP);
  console.log("заявка в списке:", JSON.stringify(found));
  await ctx.shot("v6-sale-application-list", { jpeg: true });

  // Открываем карточку заявки
  await page.evaluate((stamp) => {
    const b = [...document.querySelectorAll("button,div[role=button],li")].find(
      (x) => (x.textContent || "").includes(stamp),
    );
    (b?.closest("button,[role=button],li") ?? b)?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
  }, STAMP);
  await ctx.sleep(2500);
  console.log("карточка:", await page.evaluate(() => {
    const t = document.body.innerText;
    const m = t.match(/Документы[\s\S]{0,40}/);
    return {
      docsBadge: m ? m[0].split("\n").join(" ") : "нет блока документов",
      hasLicenseTile: /Права/.test(t),
      hasAccept: /Принять|Оформить/.test(t),
    };
  }));
  await ctx.shot("v6-sale-application-card", { jpeg: true });
}
