/** Проверка скрытия прибыли: спойлер нечитаем, ключ открывает, клик прячет обратно. */
export async function run(page, ctx) {
  const text = () => page.evaluate(() => document.body.innerText);
  const S = (n) => ctx.shot(n, { jpeg: true });

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);
  await ctx.gotoRoute("sales");
  await ctx.sleep(3000);

  const hidden = await page.evaluate(() => {
    const els = [...document.querySelectorAll("[aria-label='Скрыто — доступно директору по ключу']")];
    const first = els[0];
    const inner = first?.querySelector("span");
    return {
      скрытых: els.length,
      // само значение помечено invisible — прочитать его глазом нельзя
      невидимоеЗначение: inner ? getComputedStyle(inner).visibility : null,
      размытие: first ? getComputedStyle(first).filter : null,
      текстВнутри: (first?.textContent || "").trim().slice(0, 20),
    };
  });
  console.log("скрыто:", JSON.stringify(hidden));
  await S("sn-01-hidden");

  // клик → окно ключа
  await page.evaluate(() => {
    document.querySelector("[aria-label='Скрыто — доступно директору по ключу']")?.click();
  });
  await ctx.sleep(1500);
  console.log("ключ:", JSON.stringify({ окно: /Ключ директора|Показать прибыль/.test(await text()) }));
  await S("sn-02-key");
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) => /ключ/i.test(i.placeholder || "") || i.type === "password");
    if (inp) {
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      s.call(inp, "2626");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await ctx.sleep(400);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Подтвердить|Показать|Открыть|Проверить/.test(b.textContent || "") && !b.disabled)?.click();
  });
  await ctx.sleep(2000);
  let t = await text();
  console.log("после ключа:", JSON.stringify({
    скрытых: await page.evaluate(() => document.querySelectorAll("[aria-label='Скрыто — доступно директору по ключу']").length),
    кнопкаСкрыть: /Скрыть прибыль/.test(t),
    прибыльВидна: /295 000|прибыль/i.test(t),
  }));
  await S("sn-03-revealed");

  // клик по открытой цифре — прячем обратно
  const hiddenAgain = await page.evaluate(() => {
    const el = [...document.querySelectorAll("[title='Нажмите, чтобы снова спрятать']")][0];
    if (!el) return "нет элемента";
    el.click();
    return "клик";
  });
  await ctx.sleep(1500);
  console.log("спрятали кликом:", JSON.stringify({
    действие: hiddenAgain,
    скрытых: await page.evaluate(() => document.querySelectorAll("[aria-label='Скрыто — доступно директору по ключу']").length),
  }));
  await S("sn-04-hidden-again");

  // повторный показ — уже без ключа
  await page.evaluate(() => {
    document.querySelector("[aria-label='Скрыто — доступно директору по ключу']")?.click();
  });
  await ctx.sleep(1800);
  t = await text();
  console.log("повторный показ:", JSON.stringify({
    безКлюча: !/Ключ директора/.test(t),
    открыто: await page.evaluate(() => document.querySelectorAll("[title='Нажмите, чтобы снова спрятать']").length > 0),
  }));
  await S("sn-05-revealed-again");

  // и кнопкой в шапке обратно
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Скрыть прибыль/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(1200);
  console.log("кнопка в шапке:", JSON.stringify({
    скрытых: await page.evaluate(() => document.querySelectorAll("[aria-label='Скрыто — доступно директору по ключу']").length),
  }));
  await S("sn-06-toggle-off");
}
