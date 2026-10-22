/**
 * Карточка клиента → «Заметки» (22.10: стикеры аренды копируются клиенту).
 *   PHASE=desk|phone TAG=was|now [CLIENT="Покупкин Тест"] node scripts/shots/shot.mjs \
 *     scripts/shots/scenarios/chk-client-notes.mjs
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const tag = process.env.TAG ?? "now";
  const client = process.env.CLIENT ?? "Покупкин Тест";
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
  await ctx.gotoRoute("clients");
  await ctx.sleep(2500);
  const opened = await page.evaluate((name) => {
    const el = [...document.querySelectorAll("button, [role=button], tr, div[class*=cursor-pointer], li")]
      .filter((x) => x.getBoundingClientRect().width > 0 && (x.textContent || "").includes(name))
      .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    el?.click();
    return el ? el.textContent.trim().slice(0, 50) : null;
  }, client);
  console.log("клиент:", opened);
  await ctx.sleep(2500);
  // На телефоне заметки могут жить во вкладке — пробуем её открыть.
  await page.evaluate(() => {
    const t = [...document.querySelectorAll("button")].find((b) => /^Заметки/.test((b.textContent || "").trim()) && b.getBoundingClientRect().width > 0);
    t?.click();
  });
  await ctx.sleep(1200);
  const info = await page.evaluate(() => {
    const el = [...document.querySelectorAll("span, div")].find((d) => /^Заметки( · \d+)?$/.test((d.textContent || "").trim()));
    el?.scrollIntoView({ block: "center" });
    const t = document.body.innerText;
    const i = t.search(/Заметки/);
    return i < 0 ? "нет блока" : t.slice(i, i + 400).replace(/\s+/g, " ");
  });
  console.log("заметки:", info);
  await ctx.sleep(600);
  await ctx.shot(`notes-${phase}-${tag}`, { jpeg: true });
}
