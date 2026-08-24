/**
 * Пункты 11-12: партнёрка + электро.
 * Dio — партнёрская электро-модель; Dio #01 в аренде у Орлова (3 850 ₽).
 */
import { API, clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  // 1) Раздел «Партнёрка»
  await ctx.gotoRoute("partners");
  await ctx.sleep(2500);
  const partner = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      hasDio: t.includes("Dio #01"),
      payout: (t.match(/К выплате инвестору[\s\S]{0,30}/) || [""])[0]
        .replace(/\n+/g, " "),
      revenue: (t.match(/Выручка партнёрской техники[\s\S]{0,30}/i) || [""])[0]
        .replace(/\n+/g, " "),
    };
  });
  console.log("partners:", JSON.stringify(partner));
  await ctx.shot("p11-1-partners", { jpeg: true });

  // 2) смена процента 50 → 30
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim().replace(/\s+/g, " ") === "50 %",
    );
    b?.click();
  });
  await ctx.sleep(600);
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find(
      (i) => i.value === "50",
    );
    if (!inp) return;
    const s = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    s.call(inp, "30");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ctx.sleep(300);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "ОК",
    );
    b?.click();
  });
  await ctx.sleep(2000);
  const after = await page.evaluate(() => ({
    payout: (document.body.innerText.match(/К выплате инвестору[\s\S]{0,30}/) || [""])[0]
      .replace(/\n+/g, " "),
  }));
  console.log("after 30%:", JSON.stringify(after));
  await ctx.shot("p11-2-share30", { jpeg: true });
  // вернуть 50 (по бизнесу сейчас 50/50)
  await page.evaluate(async (api) => {
    await fetch(api + "/api/scooters/13", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerShare: 50 }),
    });
  }, API(ctx.base));

  // 3) дашборд: выручка за вычетом + кольцо с разбивкой электро
  await ctx.gotoRoute("dashboard");
  await page.reload({ waitUntil: "networkidle2" });
  await ctx.sleep(3000);
  const dash = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      gauge: (t.match(/в аренде[\s\S]{0,80}/) || [""])[0].replace(/\n+/g, " · ").slice(0, 100),
      revenue: (t.match(/Выручка\s*\n?[\d\s  ]+₽/) || [""])[0].replace(/\n+/g, " "),
    };
  });
  console.log("dashboard:", JSON.stringify(dash));
  await ctx.shot("p11-3-dashboard", { jpeg: true });

  // 4) список аренд: e-бейдж у Dio
  await ctx.gotoRoute("rentals");
  await ctx.sleep(2000);
  const eb = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("tr")].filter((r) =>
      /Dio/.test(r.textContent || ""),
    );
    const row = rows.pop();
    row?.scrollIntoView({ block: "center" });
    return {
      found: !!row,
      hasE: row ? /e-/i.test(row.textContent || "") : false,
    };
  });
  console.log("rentals e-badge:", JSON.stringify(eb));
  await ctx.sleep(600);
  await ctx.shot("p11-4-rentals", { jpeg: true });

  // 5) анкета: переключатель Бензин/Электро
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem(
      "hulk-application-draft",
      JSON.stringify({
        applicationId: null, uploadToken: null, expiresAt: null,
        fields: {}, step: 4, uploadedKinds: [],
        savedAt: new Date().toISOString(),
      }),
    );
  });
  await page.goto("about:blank");
  await page.goto(ctx.base + "/#/apply", { waitUntil: "networkidle2" });
  await ctx.sleep(3500);
  const form1 = await page.evaluate(() => ({
    hasToggle: document.body.innerText.includes("Электро"),
    models: ["Jog", "Gear", "Dio"].filter((n) =>
      document.body.innerText.includes(n),
    ),
  }));
  console.log("apply petrol view:", JSON.stringify(form1));
  await ctx.shot("p12-1-apply-petrol", { jpeg: true });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Электро/.test((x.textContent || "").trim()),
    );
    b?.click();
  });
  await ctx.sleep(1500);
  const form2 = await page.evaluate(() => ({
    models: ["Jog", "Gear", "Dio"].filter((n) =>
      document.body.innerText.includes(n),
    ),
  }));
  console.log("apply electric view:", JSON.stringify(form2));
  await ctx.shot("p12-2-apply-electric", { jpeg: true });
}
