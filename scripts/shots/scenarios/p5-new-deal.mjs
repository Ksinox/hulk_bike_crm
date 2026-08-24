/**
 * Пункт 5: «Новая сделка» в шапке (десктоп) + FAB «Сделка» на мобильном
 * дашборде. Проверяем: меню открывается, «Аренда» ведёт в окно создания,
 * остальные типы «скоро».
 */
import { clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(1500);

  // 1) Кнопка в шапке + открытое меню
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Новая сделка/.test(x.textContent || ""),
    );
    if (!b) return false;
    b.click();
    return true;
  });
  console.log("button found+clicked:", opened);
  await ctx.sleep(900);
  const menu = await page.evaluate(() => ({
    header: document.body.innerText.includes("Что оформляем?"),
    rental: document.body.innerText.includes("Скутер напрокат"),
    soon: (document.body.innerText.match(/скоро/gi) || []).length,
  }));
  console.log("menu:", JSON.stringify(menu));
  await ctx.shot("p5-1-menu", { jpeg: true });
  const clipMenu = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (e) =>
            /Что оформляем\?/.test(e.textContent || "") &&
            /Ремонт/.test(e.textContent || "") &&
            (e.textContent || "").length < 600,
        )
        .pop();
      return el ?? document.body;
    },
    10,
  );
  if (clipMenu) await ctx.shot("p5-1-menu-crop", { clip: clipMenu });

  // 2) «Аренда» → окно создания аренды
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Скутер напрокат/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(1500);
  const rentalModal = await page.evaluate(() =>
    /Новая аренда|Создание аренды|Клиент/.test(document.body.innerText),
  );
  console.log("rental modal open:", rentalModal);
  await ctx.shot("p5-2-rental-modal", { jpeg: true });
  // закрыть модалку (Esc)
  await page.keyboard.press("Escape");
  await ctx.sleep(600);

  // 3) Мобильный дашборд: FAB «Сделка» → нижний лист
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(ctx.base + "/?mobile=1", { waitUntil: "networkidle2" });
  await ctx.sleep(2500);
  const fab = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Сделка/.test((x.textContent || "").trim()),
    );
    if (!b) return false;
    b.click();
    return true;
  });
  console.log("mobile FAB:", fab);
  await ctx.sleep(1200);
  const sheet = await page.evaluate(() => ({
    header: document.body.innerText.includes("Что оформляем?"),
    types: /Рассрочка/.test(document.body.innerText),
  }));
  console.log("mobile sheet:", JSON.stringify(sheet));
  await ctx.shot("p5-3-mobile-sheet");
}
