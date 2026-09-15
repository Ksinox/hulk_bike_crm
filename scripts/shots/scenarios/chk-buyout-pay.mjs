/** Платёж по выкупу, просрочка и досрочное погашение. */
const API = "https://api-preview.104-128-128-96.sslip.io";

export async function run(page, ctx) {
  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(2600);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Выкупы")?.click();
  });
  await ctx.sleep(1400);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /#0\d{3}/.test(b.innerText || ""))?.click();
  });
  await ctx.sleep(1600);

  // Обычный платёж
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Принять платёж/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(900);
  const dlg = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      open: /Платёж по выкупу/.test(t),
      amount: document.querySelector("input[inputmode=numeric]")?.value ?? null,
      payoff: /Погасить остаток целиком/.test(t),
    };
  });
  console.log("окно платежа:", JSON.stringify(dlg));
  await ctx.shot("v6-buyout-payment", { jpeg: true });

  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /^Принять платёж$/.test((b.textContent || "").trim()))?.click();
  });
  await ctx.sleep(2600);
  const after = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      percent: t.match(/ВЫПЛАЧЕНО\s*(\d+)%/i)?.[1] ?? t.match(/Выплачено\s*(\d+)%/)?.[1],
      paidRow: (t.match(/Платёж\s*\n?\d/g) || []).length,
      left: t.match(/ОСТАТОК\s*([\d\s]+) ₽/i)?.[1]?.replace(/\s/g, ""),
    };
  });
  console.log("после платежа:", JSON.stringify(after));
  await ctx.shot("v6-buyout-after-pay", { jpeg: true });

  // Досрочное погашение остатка
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Принять платёж/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(900);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Погасить остаток целиком/.test(b.textContent || ""))?.click();
  });
  await ctx.sleep(3000);
  const closed = await page.evaluate(async (API) => {
    const r = await fetch(`${API}/api/buyout/deals`, { credentials: "include" });
    const { items } = await r.json();
    const d = items[0];
    return d
      ? { status: d.status, percent: d.progress.percent, left: d.progress.left }
      : null;
  }, API);
  console.log("после досрочного:", JSON.stringify(closed));

  // Техника должна стать «Продан»
  const scooter = await page.evaluate(async (API) => {
    const r = await fetch(`${API}/api/buyout/deals`, { credentials: "include" });
    const { items } = await r.json();
    const id = items[0]?.scooterId;
    if (!id) return null;
    const s = await fetch(`${API}/api/scooters/${id}`, { credentials: "include" });
    const sc = await s.json();
    return { name: sc.name, status: sc.baseStatus };
  }, API);
  console.log("техника:", JSON.stringify(scooter));
  await ctx.shot("v6-buyout-closed", { jpeg: true });
}
