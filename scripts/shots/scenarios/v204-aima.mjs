/** Правки 7.0, п.5: модель отметили «электро» — техника в ряду электро (зелёный кружок) + журнал. PHASE=desk|phone */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const sfx = phase === "phone" ? "-m" : "";
  const S = (n) => ctx.shot(`v204-${n}${sfx}-now`, { jpeg: true });
  if (phase === "phone") await page.setUserAgent(PHONE_UA);
  await page.setViewport(
    phase === "desk"
      ? { width: 1440, height: 900, deviceScaleFactor: 1 }
      : { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  );
  const click = (src, sel = "button") =>
    page.evaluate((src, sel) => {
      const rx = new RegExp(src);
      const el = [...document.querySelectorAll(sel)]
        .filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && rx.test((x.textContent || "").trim()); })
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      el?.click();
      return el ? (el.textContent || "").trim().slice(0, 40) : null;
    }, src.source, sel);
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Посмотрю позже|^Позже$/.test(x.textContent || ""));
    b?.click();
  });
  await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}" });
  await ctx.gotoRoute("fleet");
  await ctx.sleep(1500);
  console.log("режим:", await click(phase === "desk" ? /^Аренда$/ : /^Аренда/));
  await ctx.sleep(1500);
  const row = await page.evaluate(() => {
    const el = [...document.querySelectorAll("tr, button, div")].find((x) => /AIMA ТЕСТ/.test(x.textContent || "") && (x.textContent || "").length < 200);
    el?.scrollIntoView({ block: "center" });
    return el ? (el.textContent || "").replace(/\s+/g, " ").slice(0, 90) : null;
  });
  console.log("строка:", row);
  const badge = await page.evaluate(() => {
    const b = [...document.querySelectorAll("[data-slot-pool]")].map((x) => `${x.textContent}:${x.getAttribute("data-slot-pool")}`);
    return b.join(" ");
  });
  console.log("кружки:", badge);
  await S("aima");
  // Журнал техники
  if (phase === "desk") {
    console.log("журнал:", await click(/^Журнал$/));
  } else {
    console.log("журнал:", await click(/Журнал/));
  }
  await ctx.sleep(2500);
  const line = await page.evaluate(() => document.body.innerText.match(/Модель «AIMA ТЕСТ»[^\n]*/)?.[0] ?? null);
  console.log("запись:", line);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("div, li, tr")].find((x) => /Модель «AIMA ТЕСТ»/.test(x.textContent || "") && (x.textContent || "").length < 400);
    el?.scrollIntoView({ block: "center" });
  });
  await ctx.sleep(500);
  await S("aima-journal");
}
