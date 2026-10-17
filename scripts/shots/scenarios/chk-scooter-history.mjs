/**
 * Карточка скутера → «Аренды» (баг 17.10: вкладка пустая, хотя аренд было
 * много). Открывает скутер поиском и снимает вкладку истории аренд.
 *   PHASE=desk|phone TAG=was|now [Q="AIMA"] node scripts/shots/shot.mjs \
 *     scripts/shots/scenarios/chk-scooter-history.mjs
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const tag = process.env.TAG ?? "now";
  const q = process.env.Q ?? "AIMA";
  if (phase === "phone") await page.setUserAgent(PHONE_UA);
  await page.setViewport(
    phase === "phone"
      ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
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
  await ctx.gotoRoute("fleet");
  await ctx.sleep(3000);
  // Поиск скутера.
  await page.evaluate((val) => {
    const inp = [...document.querySelectorAll("input")].find((i) => /Номер|VIN/.test(i.placeholder || ""));
    if (!inp) return;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(inp, val);
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  }, q);
  await ctx.sleep(1200);
  // Открыть первую найденную строку/плитку.
  const opened = await page.evaluate((val) => {
    const r = new RegExp(val, "i");
    const el = [...document.querySelectorAll("button, [role=button], div[class*=cursor-pointer]")]
      .filter((x) => x.getBoundingClientRect().width > 0 && r.test(x.textContent || "") && /км|Открыть/.test(x.textContent || "") && !/Номер|VIN/.test(x.textContent || ""))
      .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    el?.click();
    return el ? el.textContent.trim().slice(0, 60) : null;
  }, q);
  console.log("скутер:", opened);
  await ctx.sleep(2500);
  // Вкладка «Аренды».
  const tab = await page.evaluate(() => {
    const el = [...document.querySelectorAll("button, [role=tab]")]
      .filter((x) => x.getBoundingClientRect().width > 0 && /^Аренды\s*\d+$/.test((x.textContent || "").trim()))
      .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    el?.click();
    return el ? el.textContent.trim() : null;
  });
  console.log("вкладка:", tab);
  await ctx.sleep(2000);
  const text = await page.evaluate(() => {
    const t = document.body.innerText;
    const i = t.search(/По этому скутеру ещё не было аренд|Период|Снят при замене/);
    return i < 0 ? "(не нашёл блок)" : t.slice(i, i + 400).replace(/\s+/g, " ");
  });
  console.log("история:", text);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("div, span")].find((d) => /^(По этому скутеру ещё не было аренд|Период)$/.test((d.textContent || "").trim()));
    el?.scrollIntoView({ block: "center" });
  });
  await ctx.sleep(600);
  await ctx.shot(`hist-${phase}-${tag}`, { jpeg: true });
}
