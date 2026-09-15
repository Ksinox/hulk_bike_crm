/**
 * Кадры карточек презентации 2.0 (экран «Что изменилось»).
 * Снимаются с превью в apps/web/public/release/2.0/. Компьютер 1280×800,
 * телефон 390×844. Ничего не сохраняем в CRM.
 */
import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve("apps/web/public/release/2.0");
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  fs.mkdirSync(DIR, { recursive: true });
  const save = async (name) => {
    await ctx.sleep(400);
    await page.screenshot({ path: path.join(DIR, `${name}.jpg`), type: "jpeg", quality: 80 });
    console.log("кадр", name);
  };
  const click = (re, sel = "button") =>
    page.evaluate(
      (src, sel) => {
        const rx = new RegExp(src);
        const els = [...document.querySelectorAll(sel)].filter((x) => {
          const r = x.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && rx.test((x.textContent || "").trim());
        });
        const el = els.sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.click();
        return !!el;
      },
      re.source,
      sel,
    );
  const home = async () => {
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(5000);
  };

  /* ---------------- компьютер ---------------- */
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.5 });
  await home();
  await ctx.gotoRoute("sales");
  await ctx.sleep(2500);
  await save("d-sales");
  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(2500);
  await save("d-buyout");
  await ctx.gotoRoute("service");
  await ctx.sleep(2500);
  await save("d-service");
  await ctx.gotoRoute("analytics");
  await ctx.sleep(3500);
  await click(/^Расчётный период$/);
  await ctx.sleep(1500);
  console.log(
    "аналитика:",
    JSON.stringify(
      await page.evaluate(() => ({
        поумолчанию: /Сделать по умолчанию/.test(document.body.innerText),
      })),
    ),
  );
  await save("d-analytics");
  await ctx.gotoRoute("staff");
  await ctx.sleep(2500);
  await click(/Новый сотрудник|Добавить сотрудника/);
  await ctx.sleep(1800);
  await save("d-staff");
  await page.keyboard.press("Escape");
  await home();
  const box = await page.evaluate(() => {
    const i = document.querySelector('input[placeholder^="Поиск: клиент"]');
    const r = i.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await page.keyboard.type("7", { delay: 60 });
  await ctx.sleep(1600);
  await save("d-search");

  // экран входа — без сессии
  const cookies = await page.cookies(ctx.base.replace("crm-", "api-"));
  await page.deleteCookie(...cookies);
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await save("d-login");
  await page.setCookie(...cookies);

  /* ---------------- телефон ---------------- */
  await page.setUserAgent(PHONE_UA);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await home();
  await ctx.gotoRoute("sales");
  await ctx.sleep(2500);
  await save("m-sales");
  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(2500);
  await save("m-buyout");
  await ctx.gotoRoute("service");
  await ctx.sleep(2500);
  await save("m-service");
  await ctx.gotoRoute("analytics");
  await ctx.sleep(3500);
  await save("m-analytics");
  await ctx.gotoRoute("staff");
  await ctx.sleep(2500);
  await save("m-staff");
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2000);
  await click(/Сделка$/);
  await ctx.sleep(1500);
  await save("m-deals");
  await page.deleteCookie(...cookies);
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  await save("m-login");
  await page.setCookie(...cookies);
}
