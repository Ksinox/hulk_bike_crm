/**
 * Окно ввода движений: шаги, накопление строк, запись пачкой.
 *
 * Сценарий заказчика (21.09): «Добавить» открывает попап, вводим по шагам,
 * строка падает вниз окна, в конце «Записать все строки» — и они улетают
 * в раздел.
 *   PHASE=desk|tablet|phone node scripts/shots/shot.mjs scripts/shots/scenarios/chk-fin-dialog.mjs
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const sfx = phase === "desk" ? "" : phase === "tablet" ? "-t" : "-m";
  const S = (n) => ctx.shot(`fin-dlg-${n}${sfx}`, { jpeg: true });
  if (phase === "phone") await page.setUserAgent(PHONE_UA);
  if (phase === "tablet") await page.setUserAgent(IPAD_UA);
  await page.setViewport(
    phase === "phone"
      ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : phase === "tablet"
        ? { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
        : { width: 1440, height: 900, deviceScaleFactor: 1 },
  );
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Посмотрю позже|^Позже$/.test(b.textContent || ""))?.click();
  });
  await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}" });

  const click = (rx) =>
    page.evaluate((src) => {
      const r = new RegExp(src);
      const el = [...document.querySelectorAll("button, [role=button], a")]
        .filter((x) => {
          const b = x.getBoundingClientRect();
          return b.width > 0 && b.height > 0 && r.test((x.textContent || "").trim());
        })
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      el?.click();
      return el ? (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 46) : null;
    }, rx.source);
  /** Состояние окна: шаг, сколько строк в пачке, текст кнопки записи. */
  const dlg = () =>
    page.evaluate(() => {
      const t = document.body.innerText.replace(/\s+/g, " ");
      const open = /Новый (расход|приход)/.test(t);
      return {
        окно: open,
        шаг: t.match(/Шаг \d из 3/i)?.[0] ?? null,
        пачка: t.match(/В этом окне · \d+ (строка|строк) на [^·]{0,20}₽/)?.[0] ?? null,
        кнопка: t.match(/Записать \d+ (строку|строк)[^₽]*₽|Записать строки/)?.[0] ?? null,
      };
    });

  let opened = await click(/^Финансы$/);
  if (!opened) {
    await click(/^Ещё$/);
    await ctx.sleep(900);
    opened = await click(/^Финансы$/);
  }
  await ctx.sleep(2500);
  await click(/^Расход$/);
  await ctx.sleep(1500);
  const before = await page.evaluate(() => document.body.innerText.includes("ТЕСТ окно"));
  console.log("до начала строк нет:", !before);
  console.log("кнопка:", await click(/^Добавить$/));
  await ctx.sleep(1200);
  console.log("окно открылось:", JSON.stringify(await dlg()));
  await S("01-open");

  // строка 1 — с клавиатуры
  await page.keyboard.type("ТЕСТ окно — масло");
  await page.keyboard.press("Enter");
  await ctx.sleep(700);
  await page.keyboard.type("3200");
  await page.keyboard.press("Enter");
  await ctx.sleep(800);
  console.log("шаг статьи:", JSON.stringify(await dlg()));
  await S("02-step3");
  await page.keyboard.press("7");
  await ctx.sleep(1200);
  console.log("после первой строки:", JSON.stringify(await dlg()));
  await S("03-one-row");

  // строка 2
  await page.keyboard.type("ТЕСТ окно — свечи");
  await page.keyboard.press("Enter");
  await ctx.sleep(600);
  await page.keyboard.type("900");
  await page.keyboard.press("Enter");
  await ctx.sleep(700);
  await page.keyboard.press("7");
  await ctx.sleep(1200);
  console.log("после второй строки:", JSON.stringify(await dlg()));
  await S("04-two-rows");

  // в разделе строк ещё быть не должно — они живут в окне
  const leaked = await page.evaluate(() => {
    const dialog = [...document.querySelectorAll("div")].find((d) =>
      /Новый расход/.test(d.innerText || ""),
    );
    const all = [...document.querySelectorAll("div")].filter((d) =>
      /ТЕСТ окно — масло/.test(d.innerText || ""),
    );
    return all.every((d) => dialog?.contains(d) ?? false);
  });
  console.log("строки пока только в окне:", leaked);

  console.log("запись:", await click(/^Записать \d+/));
  await ctx.sleep(2500);
  const after = await page.evaluate(() => ({
    окноЗакрыто: !/Новый расход/.test(document.body.innerText),
    перваяВСписке: document.body.innerText.includes("ТЕСТ окно — масло"),
    втораяВСписке: document.body.innerText.includes("ТЕСТ окно — свечи"),
    тост: /Записано 2 строк/.test(document.body.innerText),
  }));
  console.log("после записи:", JSON.stringify(after));
  await S("05-saved");
}
