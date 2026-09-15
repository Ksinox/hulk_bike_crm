/**
 * Проверка кадрирования аватарки (06.09): удаляем аватарку у модели,
 * загружаем ту же картинку с сервера, кадрируем по рамке, отзеркаливаем
 * (техника должна смотреть вправо), сохраняем и перекадрируем без файла.
 *
 * Запуск: SRC=<путь к картинке> MODEL=<название модели>
 */
export async function run(page, ctx) {
  const SRC =
    process.env.SRC ||
    "C:/Users/Maxpi/AppData/Local/Temp/claude/E-----------/ea6f76f6-fa43-40e6-8046-7f2fa200e144/scratchpad/model-6.webp";
  const MODEL = process.env.MODEL || "U-5";
  const text = () => page.evaluate(() => document.body.innerText);
  const S = (n) => ctx.shot(n, { jpeg: true });
  const click = (needle, exact = false) =>
    page.evaluate(
      ({ needle, exact }) => {
        const b = [...document.querySelectorAll("button")].find((x) => {
          const t = (x.textContent || "").trim();
          return (exact ? t === needle : t.includes(needle)) && !x.disabled;
        });
        if (b) b.click();
        return b ? (b.textContent || "").trim().slice(0, 40) : null;
      },
      { needle, exact },
    );

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);

  /* ---- 1. Скутеры → Модели → карточка модели ---- */
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);
  await click("Модели", true);
  await ctx.sleep(2000);
  await S("c-01-models-list");

  const opened = await page.evaluate((name) => {
    // Ищем карточку именно этой модели: поднимаемся от кнопки-карандаша,
    // пока элемент не станет одной карточкой (ровно одна такая кнопка внутри)
    // и не будет содержать название модели.
    const btns = [...document.querySelectorAll('button[title="Изменить"]')];
    for (const b of btns) {
      let el = b.parentElement;
      for (let i = 0; i < 6 && el; i++) {
        const one = el.querySelectorAll('button[title="Изменить"]').length === 1;
        const txt = (el.textContent || "").trim();
        if (one && txt.includes(name) && txt.length < 200) {
          el.scrollIntoView({ block: "center" });
          b.click();
          return true;
        }
        el = el.parentElement;
      }
    }
    return false;
  }, MODEL);
  await ctx.sleep(2200);
  let t = await text();
  console.log("форма модели:", JSON.stringify({
    открыта: opened && /Фото модели|ФОТО МОДЕЛИ/i.test(t),
    перекадрировать: /Перекадрировать/.test(t),
  }));
  await S("c-02-model-form");

  /* ---- 2. Удаляем аватарку (с подтверждением) ---- */
  const del = await click("Удалить", true);
  await ctx.sleep(1400);
  await S("c-03-delete-confirm");
  // подтверждаем в модалке «Удалить аватарку?»
  const confirmed = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll("div")].find(
      (d) => /Удалить аватарку\?/.test(d.textContent || "") && (d.textContent || "").length < 400,
    );
    const btn = [...(dlg ? dlg.querySelectorAll("button") : [])].find(
      (b) => (b.textContent || "").trim() === "Удалить",
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  await ctx.sleep(1500);
  console.log("удаление:", JSON.stringify({
    кнопка: del,
    подтверждено: confirmed,
    тост: /Отменить|удалена|удалили/i.test(await text()),
  }));
  await S("c-04-delete-undo");
  // ждём, пока окно отмены закроется и удаление уйдёт на сервер
  await ctx.sleep(9000);
  await S("c-04b-avatar-empty");

  /* ---- 3. Загружаем картинку и кадрируем ---- */
  const input = await page.$('input[type=file]');
  if (!input) {
    console.log("НЕТ input[type=file] — прерываю");
    return;
  }
  await input.uploadFile(SRC);
  await ctx.sleep(3000);
  t = await text();
  console.log("диалог кропа:", JSON.stringify({
    открыт: /Кропнуть аватарку/.test(t),
    рамка: /зеркала и руль/.test(t) && /колёса и подножка/.test(t),
    превью: /Как будет выглядеть/.test(t),
    карточки: ["Карточка модели", "Выбор модели в анкете", "Блок «Скутер» в аренде"].filter((x) => t.includes(x)),
  }));
  await S("c-05-crop-guide");

  /* ---- 4. Отзеркаливаем: техника должна смотреть вправо ---- */
  const doFlip = process.env.FLIP !== "0";
  const flipped = doFlip && await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      (x.getAttribute("title") || "").startsWith("Отзеркалить"),
    );
    if (!b) return false;
    b.click();
    return true;
  });
  await ctx.sleep(2000);
  console.log("зеркало:", JSON.stringify({ кнопка: flipped }));
  await S("c-06-flipped");

  /* ---- 5. Подгоняем зум под рамку и сохраняем ---- */
  await page.evaluate(() => {
    const range = document.querySelector('input[type=range]');
    if (!range) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(range, "1.15");
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await ctx.sleep(1800);
  await S("c-07-zoom-fit");
  const saved = await click("Сохранить", true);
  await ctx.sleep(6000);
  console.log("сохранение:", JSON.stringify({ кнопка: saved }));
  await S("c-08-saved-card");

  /* ---- 6. Перекадрируем БЕЗ файла — из исходника на сервере ---- */
  const recrop = await click("Перекадрировать");
  await ctx.sleep(4000);
  t = await text();
  console.log("перекадрирование:", JSON.stringify({
    кнопка: recrop,
    диалог: /Кропнуть аватарку/.test(t),
    рамкаНаМесте: /зеркала и руль/.test(t),
  }));
  await S("c-09-recrop-open");
  // двигаем зум — видно, что кадр реально меняется
  await page.evaluate(() => {
    const range = document.querySelector('input[type=range]');
    if (!range) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(range, "0.85");
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await ctx.sleep(1800);
  await S("c-10-recrop-zoom");
  await click("Сохранить", true);
  await ctx.sleep(6000);
  await S("c-11-recrop-saved");

  /* ---- 7. Карточка модели в общем списке ---- */
  await page.keyboard.press("Escape");
  await ctx.sleep(1500);
  await S("c-12-models-list-after");
}
