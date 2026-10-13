/**
 * Окно приёмки: как ведёт себя поле пробега (баг 13.10). Ничего не
 * сохраняет — открываем «Закрыть аренду», вводим разные пробеги, снимаем
 * кадры и смотрим, нажимается ли кнопка завершения.
 *   PHASE=desk|tablet node scripts/shots/shot.mjs scripts/shots/scenarios/chk-mileage-intake.mjs
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const client = process.env.CLIENT ?? "Алексей Смирнов";
  if (phase === "tablet") await page.setUserAgent(IPAD_UA);
  await page.setViewport(
    phase === "tablet"
      ? { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
      : { width: 1440, height: 900, deviceScaleFactor: 1 },
  );
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(7000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Посмотрю позже|^Позже$/.test(b.textContent || ""))?.click();
  });
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
  });

  const tap = async (rx, pause = 1800) => {
    const box = await page.evaluate((src) => {
      const r = new RegExp(src);
      const el = [...document.querySelectorAll("button, [role=button], a, li, tr, div[class*=cursor-pointer]")]
        .filter((x) => {
          const b = x.getBoundingClientRect();
          return b.width > 2 && b.height > 2 && r.test((x.textContent || "").trim());
        })
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, t: (el.textContent || "").trim().slice(0, 30) };
    }, rx.source);
    if (!box) return null;
    await page.mouse.click(box.x, box.y);
    await ctx.sleep(pause);
    return box.t;
  };

  /** Ввести пробег в поле приёмки (input type=number рядом с «Пробег, км»). */
  const typeMileage = async (v) => {
    const sel = await page.evaluate(() => {
      const labels = [...document.querySelectorAll("label")].filter((l) => /Пробег, км/.test(l.textContent || ""));
      const input = labels.map((l) => l.parentElement?.querySelector('input[type="number"]')).find(Boolean);
      if (!input) return false;
      input.setAttribute("data-mileage", "1");
      input.scrollIntoView({ block: "center" });
      return true;
    });
    if (!sel) return false;
    await page.click('[data-mileage="1"]');
    // стираем прежнее значение целиком
    for (let i = 0; i < 14; i++) await page.keyboard.press("Backspace");
    await page.keyboard.type(String(v));
    await ctx.sleep(500);
    return true;
  };

  const state = () =>
    page.evaluate(() => {
      const t = document.body.innerText;
      const btn = [...document.querySelectorAll("button")].find((b) =>
        /^(Завершить|Далее|Принять|Закрыть аренду)/.test((b.textContent || "").trim()) &&
        b.getBoundingClientRect().top > window.innerHeight * 0.5,
      );
      return {
        предупреждение: /В системе записано/.test(t),
        галочка: /Это исправление/.test(t),
        лишниеЦифры: /лишних цифр/.test(t),
        рост: /км\s*за аренду/.test(t),
        кнопкаАктивна: btn ? !btn.disabled : null,
      };
    });

  await ctx.gotoRoute("rentals");
  await ctx.sleep(2400);
  console.log("аренда:", await tap(new RegExp(client), 2600));
  console.log("закрыть:", await tap(/^Закрыть аренду$/, 2400));
  // если сначала спрашивают дату — подтверждаем
  await tap(/^Продолжить$/, 1500);

  const tag = phase === "tablet" ? "t" : "d";
  console.log("ввод 45674567:", await typeMileage(45674567), JSON.stringify(await state()));
  await ctx.shot(`mil-${tag}-1-big`, { jpeg: true });
  console.log("ввод 5:", await typeMileage(5), JSON.stringify(await state()));
  await ctx.shot(`mil-${tag}-2-lower`, { jpeg: true });
  console.log("галочка:", await tap(/^Это исправление/, 800), JSON.stringify(await state()));
  await ctx.shot(`mil-${tag}-3-corrected`, { jpeg: true });
  // остальное заполняем, чтобы проверить именно влияние пробега на кнопку
  await tap(/^Без ущерба$/, 600);
  await tap(/^Дорого$/, 600);
  console.log("всё заполнено, исправление отмечено:", JSON.stringify(await state()));
  await tap(/^Это исправление/, 600);
  console.log("исправление снято:", JSON.stringify(await state()));
  await ctx.shot(`mil-${tag}-4-unchecked`, { jpeg: true });
  console.log("ввод 8150 (обычный рост):", await typeMileage(8150), JSON.stringify(await state()));
  await ctx.shot(`mil-${tag}-5-grow`, { jpeg: true });
  // окно закрываем без сохранения
  await page.keyboard.press("Escape");
}
