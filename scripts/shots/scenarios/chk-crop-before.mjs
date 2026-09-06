/** «БЫЛО» для кадрирования: старый диалог — тёмный фон, без рамки, зеркала и превью. */
export async function run(page, ctx) {
  const SRC =
    process.env.SRC ||
    "C:/Users/Maxpi/AppData/Local/Temp/claude/E-----------/ea6f76f6-fa43-40e6-8046-7f2fa200e144/scratchpad/model-6.webp";
  const MODEL = process.env.MODEL || "U-5";
  const text = () => page.evaluate(() => document.body.innerText);
  const S = (n) => ctx.shot(n, { jpeg: true });

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Модели")?.click();
  });
  await ctx.sleep(2500);

  const opened = await page.evaluate((name) => {
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
  console.log("форма (старая):", JSON.stringify({
    открыта: opened,
    перекадрировать: /Перекадрировать/.test(t),
    кнопки: await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .map((b) => (b.textContent || "").trim())
        .filter((x) => /Заменить|Удалить|Загрузить|Перекадрировать/.test(x)),
    ),
  }));
  await S("b-crop-1-model-form");

  // Открываем старый диалог кропа — только смотрим, ничего не сохраняем.
  const input = await page.$('input[type=file]');
  if (!input) {
    console.log("нет input[type=file]");
    return;
  }
  await input.uploadFile(SRC);
  await ctx.sleep(3000);
  t = await text();
  console.log("старый диалог:", JSON.stringify({
    открыт: /Кропнуть аватарку/.test(t),
    рамка: /зеркала и руль/.test(t),
    превью: /Как будет выглядеть/.test(t),
    зеркало: await page.evaluate(() =>
      [...document.querySelectorAll("button")].some((b) => (b.getAttribute("title") || "").startsWith("Отзеркалить")),
    ),
  }));
  await S("b-crop-2-old-dialog");
  // Ничего не сохраняем — закрываем.
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Отмена")?.click();
  });
  await ctx.sleep(800);
}
