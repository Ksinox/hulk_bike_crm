/**
 * Правки 7.0, п.16 — «Игнорировать долг» при оплате продления. Только в
 * ПЕСОЧНИЦЕ (копия базы превью): аренда №32 без просрочки, с ущербом 10 000 ₽.
 *   SHOT_BASE=http://localhost:5174 SHOT_API=http://localhost:5174 PHASE=desk|phone|tablet SUBMIT=1
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const when = process.env.WHEN ?? "now";
  const client = process.env.CLIENT ?? "Роман Новиков";
  const sfx = phase === "phone" ? "-m" : phase === "tablet" ? "-t" : "";
  const S = (n) => ctx.shot(`v204-pay-${n}${sfx}-${when}`, { jpeg: true });
  const sleep = ctx.sleep;
  const click = (re, scope = "body", sel = "button, [role=button], [role=switch]") =>
    page.evaluate(
      (src, scope, sel) => {
        const rx = new RegExp(src);
        const root = [...document.querySelectorAll(scope)].pop() ?? document.body;
        const el = [...root.querySelectorAll(sel)]
          .filter((x) => {
            const r = x.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && rx.test((x.textContent || "").trim());
          })
          .sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.click();
        return el ? (el.textContent || "").trim().slice(0, 60) : null;
      },
      re.source,
      scope,
      sel,
    );
  const calls = [];
  page.on("request", (r) => {
    if (["POST", "PATCH", "DELETE"].includes(r.method()) && /\/api\/(payments|rentals)/.test(r.url()))
      calls.push(`${r.method()} ${r.url().replace(/^.*\/api/, "/api")} ${r.postData() ?? ""}`.slice(0, 260));
  });
  if (phase === "phone") await page.setUserAgent(PHONE_UA);
  if (phase === "tablet") await page.setUserAgent(IPAD_UA);
  await page.setViewport(
    phase === "desk"
      ? { width: 1440, height: 900, deviceScaleFactor: 1 }
      : phase === "phone"
        ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  );
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await sleep(6000);
  await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}" });
  await ctx.gotoRoute("rentals");
  await sleep(1500);
  console.log("аренда:", await click(new RegExp("^" + client), "body", "div, li, button, tr, a"));
  await sleep(2500);
  console.log("оплата:", await click(/^Принять оплату$/));
  await sleep(2000);
  await S("01-open");

  if (phase === "desk") {
    const row = await page.evaluate(() => document.querySelector("[data-ignore-debt]")?.innerText ?? null);
    console.log("строка «Игнорировать долг»:", row?.replace(/\n+/g, " | "));
    await page.evaluate(() => document.querySelector("[data-ignore-debt] [role=switch]")?.click());
    await sleep(800);
    console.log("7 дней:", await click(/^7д$|^7 дн/));
    await sleep(800);
    await page.evaluate(() => document.querySelector("[data-ignore-debt]")?.scrollIntoView({ block: "center" }));
    await S("02-ignore");
  } else {
    // Шаг «Долг»
    console.log("шаг:", await page.evaluate(() => document.body.innerText.match(/Шаг \d · [^\n]+/)?.[0]));
    await click(/Игнорировать долг/, "body", "[role=switch]");
    await sleep(700);
    await S("02-debt-ignore");
    await click(/^Далее$/);
    await sleep(900);
    console.log("шаг:", await page.evaluate(() => document.body.innerText.match(/Шаг \d · [^\n]+/)?.[0]));
    console.log("7 дней:", await click(/^7д$/));
    await sleep(600);
    await S("03-extend");
    await click(/^Далее$/);
    await sleep(900);
    console.log("шаг:", await page.evaluate(() => document.body.innerText.match(/Шаг \d · [^\n]+/)?.[0]));
  }
  // Способ оплаты
  console.log("способ:", await click(/^Наличные/));
  await sleep(600);
  const summary = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      ignored: document.querySelector("[data-ignored-debt]")?.innerText.replace(/\n+/g, " ") ?? null,
      accept: t.match(/Принимаем наличными\s*\n?\s*[\d\s]+₽/)?.[0]?.replace(/\s+/g, " ") ?? null,
      k: t.match(/К приёму[^\n]*\n?[^\n]*/)?.[0]?.replace(/\s+/g, " ") ?? null,
    };
  });
  console.log("сводка:", JSON.stringify(summary));
  await S("04-pay");
  if (process.env.SUBMIT === "1") {
    const btn = phase === "desk" ? /^Принять|^Продлить|Принять оплату/ : /^Принять$/;
    console.log("жмём:", await click(btn, "[role=dialog], .fixed.inset-0"));
    await sleep(900);
    console.log("подтверждение:", (await click(/^Да, принять$/)) ?? (await click(/^Подтвердить$/)));
    await sleep(4000);
    console.log("запросы:\n  " + calls.join("\n  "));
    await S("05-done");
  }
}
