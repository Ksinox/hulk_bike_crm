/**
 * Блок «Финансы» — живая проверка на превью.
 *
 * Проходим сценарий целиком: вносим приход и расход, правим сумму, удаляем с
 * возвратом, заводим постоянную издержку и человека в ФОТ, смотрим обзор.
 * Попутно снимаем кадры и проверяем, что вёрстка не едет.
 *   PHASE=desk|tablet|phone node scripts/shots/shot.mjs scripts/shots/scenarios/chk-finance.mjs
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const sfx = phase === "desk" ? "" : phase === "tablet" ? "-t" : "-m";
  const S = (n) => ctx.shot(`fin-${n}${sfx}`, { jpeg: true });
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

  const click = (rx, sel = "button, [role=button], a") =>
    page.evaluate(
      (src, sel) => {
        const r = new RegExp(src);
        const el = [...document.querySelectorAll(sel)]
          .filter((x) => {
            const b = x.getBoundingClientRect();
            return b.width > 0 && b.height > 0 && r.test((x.textContent || "").trim());
          })
          .sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.click();
        return el ? (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) : null;
      },
      rx.source,
      sel,
    );
  const type = (selector, value) =>
    page.evaluate(
      (sel, v) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const proto = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value").set;
        setter.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      },
      selector,
      value,
    );
  const overflow = () =>
    page.evaluate(() => ({
      страница: document.documentElement.scrollWidth > window.innerWidth + 2,
      заКраем: [...document.querySelectorAll("*")].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 40 && (r.right > window.innerWidth + 1 || r.left < -1);
      }).length,
    }));
  const text = (n = 220) => page.evaluate((n) => document.body.innerText.replace(/\s+/g, " ").slice(0, n), n);

  // раздел в меню (на узком экране — через «Ещё»)
  let opened = await click(/^Финансы$/);
  if (!opened) {
    await click(/^Ещё$/);
    await ctx.sleep(1000);
    opened = await click(/^Финансы$/);
  }
  console.log("пункт меню:", opened);
  await ctx.sleep(2500);
  console.log("экран:", await text(160), "|", JSON.stringify(await overflow()));
  await S("01-overview");

  /* ── приход ── */
  console.log("вкладка:", await click(/^Приход$/));
  await ctx.sleep(1200);
  await click(/^Добавить$/);
  await ctx.sleep(900);
  const inputs = await page.evaluate(() =>
    [...document.querySelectorAll("input, select")].map((i, n) => `${n}:${i.tagName}${i.type ? "/" + i.type : ""}`),
  );
  console.log("поля формы:", inputs.join(" "));
  await type('input[placeholder="Выручка аренды"]', "ТЕСТ выручка аренды");
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("input")].find((i) => i.inputMode === "numeric");
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(el, "612400");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ctx.sleep(400);
  await S("02-add");
  console.log("сохранение:", await click(/^Сохранить$/));
  await ctx.sleep(1800);
  console.log("после сохранения:", await text(200));
  await S("03-income");

  /* ── правка суммы ── */
  console.log("правка:", await click(/^Изменить$/));
  await ctx.sleep(900);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("input")].find((i) => i.inputMode === "numeric");
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(el, "598000");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click(/^Сохранить$/);
  await ctx.sleep(1600);
  console.log("после правки:", await text(200));
  await S("04-edited");

  /* ── расход + постоянная издержка ── */
  console.log("вкладка:", await click(/^Расход$/));
  await ctx.sleep(1200);
  console.log("вкладка:", await click(/^Постоянные$/));
  await ctx.sleep(1200);
  console.log("постоянные:", await text(200), "|", JSON.stringify(await overflow()));
  await S("05-recurring");

  /* ── ФОТ ── */
  console.log("вкладка:", await click(/^ФОТ$/));
  await ctx.sleep(1200);
  console.log("ФОТ:", await text(200), "|", JSON.stringify(await overflow()));
  await S("06-payroll");

  /* ── удаление с возвратом ── */
  console.log("вкладка:", await click(/^Приход$/));
  await ctx.sleep(1200);
  console.log("удаление:", await click(/^Удалить$/));
  await ctx.sleep(1500);
  const toastText = await page.evaluate(() => {
    const t = [...document.querySelectorAll("*")].find((e) => /Строка удалена/.test(e.textContent || "") && e.children.length < 6);
    return t ? (t.textContent || "").replace(/\s+/g, " ").slice(0, 80) : null;
  });
  console.log("тост:", toastText);
  await S("07-undo");
  console.log("отмена:", await click(/^Отменить$/));
  await ctx.sleep(1500);
  console.log("после отмены:", await text(200));

  /* ── обзор ── */
  console.log("вкладка:", await click(/^Обзор$/));
  await ctx.sleep(1500);
  console.log("обзор:", await text(300), "|", JSON.stringify(await overflow()));
  await S("08-overview-filled");
}
