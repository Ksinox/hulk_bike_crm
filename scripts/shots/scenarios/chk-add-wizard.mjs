/**
 * Проверка мастера «Новая техника» (2.0.1) на компьютере: категория →
 * модель и партия → таблица (вставка из Excel, дубль рамы) → проверка.
 * SUBMIT=1 — добавить партию (рамы TSTSB…, партия «ТЕСТ shotbot …»).
 */
export async function run(page, ctx) {
  const tag = Date.now().toString(36).toUpperCase().slice(-4);
  const click = (re, sel = "[data-wizard] button") =>
    page.evaluate(
      (src, sel) => {
        const rx = new RegExp(src);
        const els = [...document.querySelectorAll(sel)].filter((x) => {
          const r = x.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !x.disabled && rx.test((x.textContent || "").trim());
        });
        const el = els.sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.click();
        return el ? (el.textContent || "").trim().slice(0, 40) : null;
      },
      re.source,
      sel,
    );
  // toLocaleString ставит неразрывные пробелы — приводим к обычным.
  const text = () => page.evaluate(() => document.body.innerText.replace(/[  ]/g, " "));
  const clearInput = async (selector) => {
    await page.focus(selector);
    await page.keyboard.down("Control");
    await page.keyboard.press("KeyA");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
  };
  const paste = (selector, value) =>
    page.evaluate(
      (selector, value) => {
        const el = document.querySelector(selector);
        el.focus();
        const dt = new DataTransfer();
        dt.setData("text/plain", value);
        el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
        return !!el;
      },
      selector,
      value,
    );

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await page.evaluate(() => {
    localStorage.setItem("hulk.garageTab", "sale");
    for (const k of Object.keys(localStorage)) if (k.startsWith("hulk-draft:add-scooter")) localStorage.removeItem(k);
  });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2000);
  console.log("добавить:", await click(/Добавить скутер/, "button"));
  await ctx.sleep(1200);
  await ctx.shot("wiz-d1-category", { jpeg: true });
  console.log("шаг1 предвыбрана продажа:", /На продажу/.test(await text()));

  console.log("на продажу:", await click(/^На продажу/));
  await ctx.sleep(900);
  await ctx.shot("wiz-d2-model-sale", { jpeg: true });
  const t2 = await text();
  console.log("  тарифы в плитках (не должно):", /₽\/сут/.test(t2));
  console.log("  другие модели:", /Другие модели/.test(t2));

  console.log("модель Jog:", await click(/^Jog/));
  await ctx.sleep(300);
  console.log("кол-во 5:", await click(/^5$/));
  await page.type('input[placeholder^="Например: Партия"]', `ТЕСТ shotbot ${tag}`);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("input")].find((i) => i.placeholder === "85000");
    if (el) el.scrollIntoView();
  });
  const priceInput = await page.$('input[placeholder="85000"]');
  if (priceInput) await priceInput.type("52000");
  await ctx.sleep(400);
  await ctx.shot("wiz-d3-model-filled", { jpeg: true });
  console.log("  итог закупа:", /5 × 52 000 ₽ = 260 000 ₽/.test(await text()));

  console.log("далее:", await click(/^Далее/));
  await ctx.sleep(1000);
  await ctx.shot("wiz-d4-table-empty", { jpeg: true });

  // «Для всех»: цена продажи и год
  await page.type('input[data-row="-1"][data-col="price"]', "97000");
  await page.type('input[data-row="-1"][data-col="year"]', "2022");
  await page.type('input[data-row="-1"][data-col="color"]', "Чёрный");
  // Вставка двух столбцов из Excel в первую ячейку рамы
  const grid = [0, 1, 2, 3, 4]
    .map((i) => `tstsb${tag}w${i}\tA3E1-${tag}${i}`)
    .join("\n");
  await paste('input[data-row="0"][data-col="vin"]', grid + "\n");
  await ctx.sleep(600);
  // Дубль: в 5-ю строку — рама из 1-й (кириллическая «С» должна стать C)
  await clearInput('input[data-row="4"][data-col="vin"]');
  await page.type('input[data-row="4"][data-col="vin"]', `ТSTSB${tag}W0`); // кириллическая «Т» → T
  await page.type('input[data-row="2"][data-col="price"]', "99000");
  await ctx.sleep(500);
  await ctx.shot("wiz-d5-table-filled-dup", { jpeg: true });
  const vals = await page.evaluate(() =>
    [...document.querySelectorAll('input[data-col="vin"]')].map((i) => i.value),
  );
  console.log("  рамы:", vals.join(" | "));
  const t5 = await text();
  console.log("  ошибка дубля:", /Повтор: такая же рама в строке 1/.test(t5));
  const nextDisabled = await page.evaluate(
    () => [...document.querySelectorAll("button")].find((b) => /^Проверить/.test(b.textContent.trim()))?.disabled,
  );
  console.log("  «Проверить» заблокирована:", nextDisabled);

  // Исправляем дубль
  await clearInput('input[data-row="4"][data-col="vin"]');
  await page.type('input[data-row="4"][data-col="vin"]', `TSTSB${tag}W4`);
  await ctx.sleep(300);
  console.log("проверить:", await click(/^Проверить/));
  await ctx.sleep(900);
  await ctx.shot("wiz-d6-review", { jpeg: true });
  const t6 = await text();
  console.log("  закуп:", /5 × 52 000 ₽ = 260 000 ₽/.test(t6));
  console.log("  цена продажи итого 487 000:", /итого 487 000 ₽/.test(t6));
  console.log("  разница 227 000:", /Разница с закупом\s*227 000 ₽/.test(t6));

  if (process.env.SUBMIT === "1") {
    page.on("response", async (res) => {
      if (res.url().includes("/api/scooters/batch")) {
        console.log("  batch →", res.status(), (await res.text().catch(() => "")).slice(0, 300));
      }
    });
    page.on("console", (m) => m.type() === "error" && console.log("  console:", m.text().slice(0, 200)));
    console.log("добавить:", await click(/^Добавить 5 единиц/));
    await ctx.sleep(2500);
    await ctx.shot("wiz-d7-done", { jpeg: true });
    console.log("  тост:", /Добавлено: 5 единиц/.test(await text()));
    console.log("  окно закрыто:", !(await page.$("[data-wizard]")));
    // Поиск партии в «Скутеры → Продажа»
    const search = await page.$('input[placeholder^="Номер, модель"]') ?? await page.$('main input[type="text"]');
    if (search) {
      await search.type(`shotbot ${tag}`);
      await ctx.sleep(900);
      await ctx.shot("wiz-d8-batch-search", { jpeg: true });
      const n = await page.evaluate(() => document.body.innerText.match(/TSTSB|Jog/g)?.length ?? 0);
      console.log("  поиск по партии, совпадений в тексте:", n);
    } else console.log("  поле поиска не найдено");
  }
}
