/**
 * Кадры «было/стало» для «Развития» — планшетный проход.
 *
 * Один прогон снимает все экраны и окна, которые правились: разделы,
 * мастера, карточки, листы. Имена кадров одинаковые для старой и новой
 * сборки, отличается только префикс:
 *   PREFIX=tab-was  node scripts/shots/shot.mjs scripts/shots/scenarios/tab-tour.mjs   (старая сборка)
 *   PREFIX=tab-now  node scripts/shots/shot.mjs scripts/shots/scenarios/tab-tour.mjs   (новая)
 * VP=land|port — ориентация планшета.
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const vp = process.env.VP ?? "land";
  const prefix = process.env.PREFIX ?? "tab-now";
  const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
  await page.setUserAgent(IPAD_UA);
  await page.setViewport(
    vp === "port"
      ? { width: 820, height: 1180, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
      : { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  );
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(7000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Посмотрю позже|^Позже$/.test(b.textContent || ""))?.click();
  });
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
  });

  const shot = (n) => ctx.shot(`${prefix}-${n}-${vp}`, { jpeg: true });
  const want = (n) => !only || only.includes(n);

  const tap = async (rx, pause = 1800) => {
    const box = await page.evaluate((src) => {
      const r = new RegExp(src);
      const el = [...document.querySelectorAll("button, [role=button], [role=checkbox], a, li, tr, div[class*=cursor-pointer]")]
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

  /** Закрыть всё открытое и вернуться в раздел. */
  const reset = async (route) => {
    await page.keyboard.press("Escape");
    await ctx.sleep(500);
    await page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .filter((b) => /^(Отмена|Закрыть|Скрыть)$/.test((b.textContent || "").trim()))
        .slice(0, 1)
        .forEach((b) => b.click());
    });
    await ctx.sleep(700);
    await ctx.gotoRoute(route);
    await ctx.sleep(2200);
  };

  // 1. Мастер новой аренды
  if (want("01")) {
    await ctx.gotoRoute("rentals");
    await ctx.sleep(2400);
    console.log("аренда:", await tap(/^Аренда$/));
    await tap(/Максим Орлов/, 1600);
    await shot("01-rental");
  }

  // 2. Новая продажа
  if (want("02")) {
    await reset("sales");
    console.log("продажа:", await tap(/^Сделки$/), await tap(/^Продажа$/));
    await shot("02-sale");
  }

  // 3. Новый ремонт
  if (want("03")) {
    await reset("service");
    console.log("ремонт:", await tap(/^Новый ремонт$/));
    await shot("03-service");
  }

  // 4. Карточка аренды
  if (want("04")) {
    await reset("rentals");
    console.log("карточка аренды:", await tap(/Алексей Смирнов/, 2600));
    await shot("04-card-rental");
  }

  // 5. Карточка клиента
  if (want("05")) {
    await reset("clients");
    console.log("карточка клиента:", await tap(/Алексей Смирнов/, 2600));
    await shot("05-card-client");
  }

  // 6. Форма нового клиента
  if (want("06")) {
    await reset("clients");
    console.log("форма клиента:", await tap(/^Клиент$/, 2200));
    await shot("06-client-form");
  }

  // 7. Лист «Партии»
  if (want("07")) {
    await reset("fleet");
    console.log("партии:", await tap(/^Партии$/, 1800));
    await shot("07-batches");
  }

  // 8. Ущерб и 9. замена — из карточки аренды
  if (want("08") || want("09")) {
    await reset("rentals");
    await tap(/Алексей Смирнов/, 2600);
    if (want("08")) {
      const dots = await page.evaluate(() => {
        const el = [...document.querySelectorAll("button")].find((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 20 && r.width < 60 && r.top < 70 && r.left > window.innerWidth - 90;
        });
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      if (dots) {
        await page.mouse.click(dots.x, dots.y);
        await ctx.sleep(800);
      }
      console.log("ущерб:", await tap(/^Зафиксировать ущерб$/, 2400));
      await shot("08-damage");
      await page.keyboard.press("Escape");
      await ctx.sleep(900);
      await tap(/^Закрыть$|^Отмена$/, 900);
    }
    if (want("09")) {
      await reset("rentals");
      await tap(/Алексей Смирнов/, 2600);
      console.log("замена:", await tap(/Пробег/, 2400));
      await shot("09-swap");
    }
  }

  // 10. Партнёрка
  if (want("10")) {
    await reset("partners");
    await shot("10-partners");
  }
}
