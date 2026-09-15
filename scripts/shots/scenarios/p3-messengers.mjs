/** Пункт 3: мессенджеры у телефона — карточка аренды + заявка + клиент. */
import { clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  // 1. Карточка аренды: WhatsApp · Telegram · MAX у номера
  await ctx.gotoRoute("rentals", { rentalId: 34 });
  await ctx.sleep(1800);
  const hasWidget = await page.evaluate(
    () => !!document.querySelector('a[href^="https://wa.me/"]'),
  );
  console.log("rental widget:", hasWidget);
  const clip1 = await clipOf(
    page,
    () => {
      const el = document.querySelector('a[href^="https://wa.me/"]');
      let box = el;
      for (let i = 0; i < 6 && box; i++) {
        if ((box.className || "").includes("rounded-2xl")) break;
        box = box.parentElement;
      }
      return box ?? document.body;
    },
    10,
  );
  if (clip1) await ctx.shot("p3-1-rental-crop", { clip: clip1 });

  // 2. Заявки: виджет у телефона заявки (открываем первую)
  await ctx.gotoRoute("applications");
  await ctx.sleep(1800);
  const opened = await page.evaluate(() => {
    const row = [...document.querySelectorAll("button,[role=button],a,div")].find(
      (e) =>
        /\+7 \(\d{3}\)/.test(e.textContent || "") &&
        (e.textContent || "").length < 300 &&
        (e.className || "").includes("cursor"),
    );
    row?.click();
    return !!row;
  });
  await ctx.sleep(1600);
  const hasAppWidget = await page.evaluate(
    () => !!document.querySelector('a[href^="https://wa.me/"]'),
  );
  console.log("application opened:", opened, "widget:", hasAppWidget);
  if (hasAppWidget) {
    const clip2 = await clipOf(
      page,
      () => {
        const el = document.querySelector('a[href^="https://wa.me/"]');
        let box = el;
        for (let i = 0; i < 7 && box; i++) {
          if ((box.className || "").includes("rounded")) break;
          box = box.parentElement;
        }
        return box?.parentElement ?? document.body;
      },
      14,
    );
    if (clip2) await ctx.shot("p3-2-application-crop", { clip: clip2 });
  }

  // 3. Тап по MAX → тост «Номер скопирован для MAX»
  await ctx.gotoRoute("rentals", { rentalId: 34 });
  await ctx.sleep(1500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /MAX: скопировать/.test(x.title || ""),
    );
    b?.click();
  });
  await ctx.sleep(900);
  const toast = await page.evaluate(() =>
    document.body.innerText.includes("Номер скопирован для MAX"),
  );
  console.log("max toast:", toast);
  await ctx.shot("p3-3-max-toast");
}
