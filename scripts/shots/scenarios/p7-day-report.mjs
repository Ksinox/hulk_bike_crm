/**
 * Пункт 7: «Сводка дня» (Z-отчёт). Кнопка в шапке → окно со сводкой
 * за текущие сутки. Десктоп + мобила.
 */
import { clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(1500);
  // кадр «где кнопка» — шапка ДО открытия окна (иначе blur зальёт фон)
  const btnClip = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => x.getAttribute("aria-label") === "Сводка дня",
    );
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return {
      x: Math.max(0, r.x - 330),
      y: Math.max(0, r.y - 18),
      width: r.width + 480,
      height: r.height + 36,
    };
  });
  if (btnClip) await ctx.shot("p7-0-button-crop", { clip: btnClip });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => x.getAttribute("aria-label") === "Сводка дня",
    );
    b?.click();
  });
  await ctx.sleep(1200);
  const data = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      open: t.includes("Сводка дня"),
      hasCash: t.includes("Наличные"),
      hasCashless: t.includes("Безнал"),
      hasTotal: t.includes("Итого за сутки"),
      hasActive: t.includes("Активных сейчас"),
      hasIssued: t.includes("Выдано сегодня"),
      hasCompleted: t.includes("Завершено сегодня"),
      hasSales: t.includes("Продажи за сутки"),
      excerpt: (t.match(/Сводка дня[\s\S]{0,400}/) || [""])[0]
        .replace(/\n+/g, " · ")
        .slice(0, 380),
    };
  });
  console.log("desktop:", JSON.stringify(data, null, 1));
  await ctx.shot("p7-1-desktop", { jpeg: true });
  const clip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (e) =>
            /Сводка дня/.test(e.textContent || "") &&
            /Итого за сутки/.test(e.textContent || "") &&
            (e.textContent || "").length < 700,
        )
        .pop();
      return el ?? document.body;
    },
    10,
  );
  if (clip) await ctx.shot("p7-1-dialog-crop", { clip });

  // мобильная шапка
  await page.keyboard.press("Escape");
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(ctx.base + "/?mobile=1", { waitUntil: "networkidle2" });
  await ctx.sleep(2500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => x.getAttribute("aria-label") === "Сводка дня",
    );
    b?.click();
  });
  await ctx.sleep(1200);
  const mob = await page.evaluate(() => ({
    open: document.body.innerText.includes("Итого за сутки"),
  }));
  console.log("mobile:", JSON.stringify(mob));
  await ctx.shot("p7-2-mobile");
}
