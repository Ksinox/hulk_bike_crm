/**
 * Пошаговый ввод в «Финансах» — проверка «книги учёта» с клавиатуры.
 *
 * Сценарий заказчика: нажал «Добавить» → печатает → Enter → сумма → Enter →
 * цифра статьи → строка записана, поле снова активно для следующей.
 *   PHASE=desk|phone node scripts/shots/shot.mjs scripts/shots/scenarios/chk-fin-quick.mjs
 * Всё внесённое убирается в конце.
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const sfx = phase === "desk" ? "" : "-m";
  const S = (n) => ctx.shot(`fin-quick-${n}${sfx}`, { jpeg: true });
  if (phase === "phone") await page.setUserAgent(PHONE_UA);
  await page.setViewport(
    phase === "phone"
      ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
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
      return el ? (el.textContent || "").trim().slice(0, 30) : null;
    }, rx.source);
  const step = () =>
    page.evaluate(() => {
      const t = document.body.innerText.replace(/\s+/g, " ");
      const m = t.match(/шаг \d из 3/i);
      const n = t.match(/внесено подряд: \d+/i);
      return `${m?.[0] ?? "—"}${n ? " · " + n[0] : ""}`;
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
  console.log("кнопка:", await click(/^Добавить$/));
  await ctx.sleep(1000);
  console.log("после открытия:", await step());
  await S("01-name");

  // Печатаем прямо с клавиатуры — поле уже активно
  await page.keyboard.type("ТЕСТ клавиатура — бензин");
  await ctx.sleep(400);
  await page.keyboard.press("Enter");
  await ctx.sleep(900);
  console.log("после Enter:", await step());
  await S("02-amount");

  await page.keyboard.type("4500");
  await ctx.sleep(300);
  await page.keyboard.press("Enter");
  await ctx.sleep(900);
  console.log("после суммы:", await step());
  await S("03-category");

  // Статья цифрой
  await page.keyboard.press("2");
  await ctx.sleep(1800);
  console.log("после выбора статьи:", await step());
  const saved = await page.evaluate(() =>
    document.body.innerText.includes("ТЕСТ клавиатура — бензин"),
  );
  console.log("строка в списке:", saved);
  await S("04-saved");

  // Вторая строка подряд — не трогая мышь
  await page.keyboard.type("ТЕСТ вторая строка");
  await page.keyboard.press("Enter");
  await ctx.sleep(600);
  await page.keyboard.type("1200");
  await page.keyboard.press("Enter");
  await ctx.sleep(600);
  await page.keyboard.press("1");
  await ctx.sleep(1800);
  console.log("после второй строки:", await step());
  await S("05-second");
  const both = await page.evaluate(() => ({
    первая: document.body.innerText.includes("ТЕСТ клавиатура — бензин"),
    вторая: document.body.innerText.includes("ТЕСТ вторая строка"),
  }));
  console.log("обе строки:", JSON.stringify(both));

  await page.keyboard.press("Escape");
  await ctx.sleep(800);
  console.log("после Esc мастер закрыт:", (await step()) === "—");
}
