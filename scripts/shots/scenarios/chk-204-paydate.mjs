/** Правки 7.0 (паритет): шаг «Дата оплаты» в мобильном мастере при просрочке. Песочница. */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "phone";
  const client = process.env.CLIENT ?? "Алексей Смирнов";
  const S = (n) => ctx.shot(`chk204-${n}-${phase}`, { jpeg: true });
  if (phase === "phone") await page.setUserAgent(PHONE_UA);
  await page.setViewport(phase === "phone"
    ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6000);
  await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}" });
  const click = (src, sel = "button, [role=switch]") => page.evaluate((src, sel) => {
    const rx = new RegExp(src);
    const el = [...document.querySelectorAll(sel)].filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && rx.test((x.textContent || "").trim()); })
      .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    el?.click(); return el ? el.textContent.trim().slice(0, 50) : null;
  }, src.source, sel);
  await ctx.gotoRoute("rentals");
  await ctx.sleep(1500);
  console.log("аренда:", await click(new RegExp("^" + client), "div, li, button, tr, a"));
  await ctx.sleep(2500);
  console.log("оплата:", await click(/^Принять оплату$/));
  await ctx.sleep(2000);
  const steps = async () => page.evaluate(() => document.body.innerText.match(/Шаг \d · [^\n]+/)?.[0] + " / " + (document.body.innerText.match(/\d\/\d/)?.[0] ?? ""));
  console.log("шаг:", await steps());
  await S("01");
  // «Далее» → долг
  await click(/^Далее$/); await ctx.sleep(900);
  console.log("шаг:", await steps());
  await S("02");
  await click(/^Далее$/); await ctx.sleep(900);
  console.log("шаг:", await steps());
  await page.evaluate(() => {
    const card = [...document.querySelectorAll("div")].find((d) => /^Продлить аренду/.test(d.innerText || "") && d.querySelector("[role=switch]"));
    card?.querySelector("[role=switch]")?.click();
  });
  await ctx.sleep(600);
  await click(/^По сумме клиента$/); await ctx.sleep(600);
  await page.evaluate(() => document.querySelector("[data-ext-amount] button")?.click()); await ctx.sleep(700);
  const kb = await page.evaluate(() => document.querySelector("[data-numpad]")?.getAttribute("data-numpad") ?? (document.querySelector('[class*="z-[150]"]') ? "своя" : "нет"));
  console.log("клавиатура:", kb);
  await S("03-pad");
  if (kb === "native") {
    await page.type("[data-numpad] input", "5000");
  } else {
    for (const d of "5000") await click(new RegExp("^" + d + "$"));
  }
  await ctx.sleep(300);
  await click(/^Готово$/); await ctx.sleep(900);
  console.log("по сумме:", await page.evaluate(() => document.querySelector("[data-ext-amount]")?.innerText.replace(/\n+/g, " | ")));
  await S("04-amount");
}
