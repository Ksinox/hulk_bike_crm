/**
 * «Развитие» 2.100: рама только латиницей. PHASE=was — до правки, PHASE=now —
 * после. Русская раскладка имитируется:
 *   • компьютер — нажатия клавиш с русской буквой и кодом клавиши (KeyS → «ы»);
 *   • телефон — ввод символов без кода клавиши (экранная клавиатура).
 * Набираем «SA36J-605232» русской раскладкой: «ЫФ36О-605232». Ничего не сохраняем.
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const RU = { S: "Ы", A: "Ф", J: "О", U: "Г", F: "А" };

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "now";
  const click = (re, sel = "[data-wizard] button") =>
    page.evaluate(
      (src, sel) => {
        const rx = new RegExp(src);
        const el = [...document.querySelectorAll(sel)]
          .filter((x) => x.getBoundingClientRect().width > 0 && !x.disabled && rx.test((x.textContent || "").trim()))
          .sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.click();
        return el ? el.textContent.trim().slice(0, 30) : null;
      },
      re.source,
      sel,
    );
  const clearDraft = () =>
    page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith("hulk-draft:add-scooter")) localStorage.removeItem(k);
    });
  // Клавиша на русской раскладке: CDP отдаёт key = русская буква, code = латинская клавиша.
  const cdp = await page.createCDPSession();
  const typeRuLayout = async (latin) => {
    for (const ch of latin) {
      if (/[A-Z]/.test(ch)) {
        const ru = RU[ch] ?? ch;
        const base = { key: ru, code: `Key${ch}`, windowsVirtualKeyCode: ch.charCodeAt(0), modifiers: 8 };
        await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", text: ru, unmodifiedText: ru.toLowerCase(), ...base });
        await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
      } else {
        await page.keyboard.type(ch);
      }
    }
  };

  // ── компьютер ──
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await clearDraft();
  await page.evaluate(() => localStorage.setItem("hulk.garageTab", "sale"));
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(1800);
  await click(/Добавить скутер/, "button");
  await ctx.sleep(900);
  await click(/^На продажу/);
  await ctx.sleep(600);
  await click(/^Jog/);
  await click(/^2$/);
  await click(/^Далее/);
  await ctx.sleep(900);
  await page.focus('input[data-row="0"][data-col="vin"]');
  await typeRuLayout("SA36J-605232");
  await page.focus('input[data-row="1"][data-col="vin"]');
  await typeRuLayout("UF06J-388721");
  await page.evaluate(() => document.activeElement?.blur());
  await ctx.sleep(500);
  const d = await page.evaluate(() => [...document.querySelectorAll('input[data-col="vin"]')].map((i) => i.value));
  console.log(`[${phase}] компьютер, рамы:`, d.join(" | "));
  await ctx.shot(`vinlat-${phase}-d`, { jpeg: true });
  await page.keyboard.press("Escape");
  await ctx.sleep(400);
  await clearDraft();

  // ── телефон ──
  await page.setUserAgent(PHONE_UA);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(1800);
  await click(/^\+?\s*Скутер$/, "button");
  await ctx.sleep(900);
  await click(/^На продажу/);
  await ctx.sleep(600);
  await click(/^Jog/);
  await click(/^Далее/);
  await ctx.sleep(800);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("[data-wizard] button")].find((x) => /^Одинаковое для всех/.test(x.textContent.trim()));
    b?.click();
  });
  const vin = await page.$('[data-wizard] input[placeholder="SA36J-605232"]');
  await vin?.tap();
  // Экранная русская клавиатура: буквы-двойники и не двойники.
  await page.keyboard.sendCharacter("СА36Ы-605232");
  await ctx.sleep(500);
  const m = await page.evaluate(() => document.querySelector('[data-wizard] input[placeholder="SA36J-605232"]')?.value);
  const hint = await page.evaluate(() => /латиниц/i.test(document.querySelector("[data-wizard]")?.innerText ?? ""));
  console.log(`[${phase}] телефон, рама:`, m, "| подсказка про латиницу:", hint);
  await ctx.shot(`vinlat-${phase}-m`, { jpeg: true });
  await clearDraft();
}
