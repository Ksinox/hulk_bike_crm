/** Проверка «Аналитики»: доска, конструктор (перетаскивание/размер/план), экран-стена, мобила. */
export async function run(page, ctx) {
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

  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3500);

  /* ---- 1. Раздел открыт из сайдбара ---- */
  const sidebar = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button, a")].find((x) =>
      /Аналитика/.test(x.textContent || ""),
    );
    return {
      есть: !!btn,
      скоро: btn ? /скоро/i.test(btn.getAttribute("title") || "") : null,
      disabled: btn ? btn.disabled === true : null,
    };
  });
  console.log("сайдбар:", JSON.stringify(sidebar));

  await ctx.gotoRoute("analytics");
  await ctx.sleep(3500);
  let t = await text();
  console.log("доска:", JSON.stringify({
    заголовок: /Аналитика/.test(t),
    показателей: (t.match(/(\d+) показателей/) || [])[0],
    период: ["Сегодня", "Неделя", "Месяц", "Год"].filter((x) => t.includes(x)).length,
    плитки: ["Загрузка парка", "Активные аренды", "Просрочено", "Поступит сегодня", "План и факт"].filter((x) => t.includes(x)),
    второйМонитор: /На второй монитор/.test(t),
  }));
  await S("an-01-board");

  /* ---- 2. Конструктор: включаем режим настройки ---- */
  const edit = await click("Настроить");
  await ctx.sleep(1500);
  t = await text();
  console.log("конструктор:", JSON.stringify({
    кнопка: edit,
    каталог: /Добавить показатель/.test(t),
    сохранить: /Сохранить доску/.test(t),
  }));
  await S("an-02-editing");

  /* ---- 3. Задаём план у «Активных аренд» ---- */
  const planned = await page.evaluate(() => {
    // находим плитку с нужным заголовком и жмём кнопку-мишень
    const tiles = [...document.querySelectorAll("div")].filter(
      (d) => /Активные аренды/.test(d.textContent || "") && (d.textContent || "").length < 200,
    );
    const tile = tiles[tiles.length - 1];
    if (!tile) return "нет плитки";
    let el = tile;
    for (let i = 0; i < 6 && el; i++) {
      const btn = [...el.querySelectorAll('button[title="План"]')][0];
      if (btn) {
        btn.click();
        return "ок";
      }
      el = el.parentElement;
    }
    return "нет кнопки";
  });
  await ctx.sleep(900);
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll('input[placeholder="план"]')][0];
    if (!inp) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(inp, "6");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ctx.sleep(400);
  await S("an-03-plan-input");
  await click("ОК", true);
  await ctx.sleep(1200);
  t = await text();
  console.log("план:", JSON.stringify({
    открытие: planned,
    полоса: /план 6/.test(t),
    сводка: /План и факт/.test(t),
  }));
  await S("an-04-plan-set");

  /* ---- 4. Добавляем показатель из каталога ---- */
  const added = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /Выкупы с просрочкой|Собрано по выкупам|Сторонние ремонты/.test(b.textContent || ""),
    );
    if (!btn) return null;
    const label = (btn.textContent || "").trim().slice(0, 30);
    btn.click();
    return label;
  });
  await ctx.sleep(1200);
  console.log("добавили:", JSON.stringify({ показатель: added }));
  await S("an-05-added");

  /* ---- 5. Меняем размер плитки ---- */
  const resized = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll("div")].filter(
      (d) => /Просрочено/.test(d.textContent || "") && (d.textContent || "").length < 200,
    );
    const tile = tiles[tiles.length - 1];
    let el = tile;
    for (let i = 0; i < 6 && el; i++) {
      const btn = [...el.querySelectorAll('button[title="Больше"]')][0];
      if (btn && !btn.disabled) {
        btn.click();
        return true;
      }
      el = el.parentElement;
    }
    return false;
  });
  await ctx.sleep(900);
  console.log("размер:", JSON.stringify({ увеличили: resized }));
  await S("an-06-resized");

  /* ---- 6. Сохраняем доску ---- */
  const saved = await click("Сохранить доску");
  await ctx.sleep(2500);
  t = await text();
  console.log("сохранение:", JSON.stringify({ кнопка: saved, тост: /Доска сохранена/.test(t) }));
  await S("an-07-saved");

  /* ---- 7. Экран на второй монитор ---- */
  await page.goto(
    "https://crm-preview.104-128-128-96.sslip.io/?screen=analytics-wall",
    { waitUntil: "domcontentloaded" },
  );
  await ctx.sleep(5000);
  t = await text();
  console.log("стена:", JSON.stringify({
    заголовок: /Как идут дела/.test(t),
    часы: /\d\d:\d\d/.test(t),
    плитки: ["Загрузка парка", "Активные аренды", "План и факт"].filter((x) => t.includes(x)),
    безСайдбара: !/Дашборд|Клиенты\n/.test(t.slice(0, 200)),
  }));
  await S("an-08-wall");

  /* ---- 8. Мобильный вид ---- */
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto("https://crm-preview.104-128-128-96.sslip.io/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(4000);
  await ctx.gotoRoute("analytics");
  await ctx.sleep(3000);
  console.log("мобила:", JSON.stringify({
    плитки: ((await text()).match(/Загрузка парка|Активные аренды|Просрочено/g) || []).length,
    overflowX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  }));
  await S("an-09-mobile");
}
