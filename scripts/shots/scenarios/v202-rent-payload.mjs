/**
 * 2.0.2: что уходит на сервер при «Разделить» в «Новой аренде» (компьютер).
 * Запрос создания перехватывается и НЕ доходит до API — аренда не создаётся.
 */
export async function run(page, ctx) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  let captured = null;
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (req.method() === "POST" && /\/api\/rentals$/.test(req.url())) {
      captured = req.postData();
      req.respond({
        status: 409,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": ctx.base, "Access-Control-Allow-Credentials": "true" },
        body: JSON.stringify({ error: "test_blocked", message: "Тест: создание перехвачено" }),
      });
      return;
    }
    req.continue();
  });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5500);
  const click = (re, scope = "body") =>
    page.evaluate(
      (src, scope) => {
        const rx = new RegExp(src);
        const root = document.querySelector(scope) ?? document.body;
        const b = [...root.querySelectorAll("button")].filter((x) => {
          const r = x.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && rx.test((x.textContent || "").trim());
        });
        const el = b.sort((a, c) => a.textContent.length - c.textContent.length)[0];
        el?.click();
        return el ? el.textContent.trim().slice(0, 40) : null;
      },
      re.source,
      scope,
    );
  await click(/Новая сделка/);
  await ctx.sleep(700);
  await click(/Скутер напрокат/);
  await ctx.sleep(1500);
  // клиент — первый свободный
  await page.focus('input[placeholder^="Кликните для списка"]');
  await ctx.sleep(600);
  const client = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.querySelector(".tabular-nums") && /^\+?\d/.test(x.querySelector(".tabular-nums").textContent.trim()) && x.closest(".absolute"));
    b?.click();
    return b?.textContent?.trim().slice(0, 40) ?? null;
  });
  console.log("клиент:", client);
  await ctx.sleep(600);
  // скутер — первая кнопка в сетке свободных
  const sc = await page.evaluate(() => {
    const grid = [...document.querySelectorAll("div")].find((d) => d.className.includes("max-h-[160px]"));
    const b = grid?.querySelector("button");
    b?.click();
    return b?.textContent?.trim().slice(0, 40) ?? null;
  });
  console.log("скутер:", sc);
  await ctx.sleep(600);
  await click(/^Разделить$/, "[data-rental-pay]");
  await ctx.sleep(400);
  const inp = await page.$("[data-rental-split] input");
  await inp.click();
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await inp.type("1000");
  await ctx.sleep(300);
  const state = await page.evaluate(() => ({
    split: document.querySelector("[data-rental-split]")?.innerText.replace(/\n+/g, " | "),
    create: [...document.querySelectorAll("button")].find((b) => /Создать и выдать/.test(b.textContent || ""))?.disabled,
  }));
  console.log("доли:", JSON.stringify(state));
  await click(/Создать и выдать/);
  await ctx.sleep(1500);
  const body = captured ? JSON.parse(captured) : null;
  console.log(
    "ушло на сервер:",
    body ? JSON.stringify({ sum: body.sum, paymentMethod: body.paymentMethod, paymentSplit: body.paymentSplit }) : "НИЧЕГО",
  );
  const ok = body && body.paymentSplit && body.paymentSplit.cash === 1000 && body.paymentSplit.cash + body.paymentSplit.transfer === body.sum;
  console.log(ok ? "✓ доли сходятся с суммой" : "✗ доли не те");
  await page.keyboard.press("Escape");
}
