/**
 * Мастер оплаты на телефоне/планшете: раскрываем каждый блок и сверяем
 * варианты с компьютером — прощение, режимы продления, частичная сумма.
 *   PHASE=phone|tablet node scripts/shots/shot.mjs scripts/shots/scenarios/chk-204-pay-deep.mjs
 * Ничего не подтверждает: «Принять» не нажимаем.
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "phone";
  const client = process.env.CLIENT ?? "Алексей Смирнов";
  if (phase === "phone") await page.setUserAgent(PHONE_UA);
  else await page.setUserAgent(IPAD_UA);
  await page.setViewport(
    phase === "phone"
      ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  );
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Посмотрю позже|^Позже$/.test(b.textContent || ""))?.click();
  });
  await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}" });

  const click = (rx, sel = "button, [role=switch], [role=button]") =>
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
  const pane = () =>
    page.evaluate(() => {
      const c = [...document.querySelectorAll("div")].filter((d) => {
        const r = d.getBoundingClientRect();
        return /Принять платёж/.test(d.innerText || "") && r.height > 380 && r.width > 280;
      });
      return (c.sort((a, b) => (a.innerText || "").length - (b.innerText || "").length)[0]?.innerText || "").replace(/\s+/g, " ");
    });
  const S = (n) => ctx.shot(`chk-pay-${n}-${phase}`, { jpeg: true });

  await ctx.gotoRoute("rentals");
  await ctx.sleep(2000);
  await click(new RegExp("^" + client), "div, li, button, tr, a");
  await ctx.sleep(2500);
  await click(/^Принять оплату$/);
  await ctx.sleep(2200);

  // ШАГ «Дата оплаты» → «Долг»
  await click(/^Далее$/);
  await ctx.sleep(1200);

  // 1. Прощение просрочки — те же варианты, что на компьютере
  const forgive = await click(/Простить просрочку/, "button, [role=switch], [role=button], div");
  console.log("прощение — нажали:", forgive);
  await ctx.sleep(1200);
  console.log("варианты прощения:", (await pane()).slice(0, 700));
  await S("01-forgive");
  await click(/Простить просрочку/, "button, [role=switch], [role=button], div"); // выключаем обратно
  await ctx.sleep(900);

  // 2. Продление — режимы
  await click(/^Далее$/);
  await ctx.sleep(1200);
  await page.evaluate(() => {
    const card = [...document.querySelectorAll("div")].find(
      (d) => /^Продлить аренду/.test(d.innerText || "") && d.querySelector("[role=switch], button"),
    );
    (card?.querySelector("[role=switch]") ?? card?.querySelector("button"))?.click();
  });
  await ctx.sleep(1200);
  console.log("продление:", (await pane()).slice(0, 900));
  await S("02-extend");

  // 3. Оплата — частичная сумма
  await click(/^Далее$/);
  await ctx.sleep(1400);
  console.log("оплата до правки:", (await pane()).slice(0, 700));
  const amount = await page.evaluate(() => {
    const el = [...document.querySelectorAll("button, [role=button]")].find((b) =>
      /ПРИНИМАЕМ|Принимаем|К приёму/i.test(b.textContent || ""),
    );
    el?.click();
    return el ? (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) : null;
  });
  console.log("поле суммы:", amount);
  await ctx.sleep(1200);
  const pad = await page.evaluate(() => {
    const native = [...document.querySelectorAll("input")].find((i) => {
      const r = i.getBoundingClientRect();
      return r.width > 80 && r.height > 30 && (i.inputMode === "numeric" || i.type === "number" || i.type === "tel");
    });
    const own = [...document.querySelectorAll("button")].filter((b) => /^[0-9]$/.test((b.textContent || "").trim())).length;
    return { родная: !!native, своиЦифры: own };
  });
  console.log("клавиатура:", JSON.stringify(pad));
  await S("03-amount");
  console.log("итог экрана:", (await pane()).slice(0, 700));
}
