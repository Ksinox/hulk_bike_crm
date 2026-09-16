/**
 * Выпуск 2.0.2 — кадры «было» (17.09), до правок. PHASE:
 *   setup — тестовые строки shotbot: скутер «ТЕСТ разборка» (в разборке) и
 *           ремонт «ТЕСТ shotbot» (отменён); id → scripts/shots/out/v202-test.json
 *   desk  — компьютер 1440×900
 *   phone — телефон 390×844
 *   clean — удалить тестовые строки
 * Кадры — public/progress/v202-*-was.jpg
 */
import fs from "node:fs";
import path from "node:path";

const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IDS = path.resolve("scripts/shots/out/v202-test.json");

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const suffix = process.env.SUFFIX ?? "was";
  const S = (n) => ctx.shot(`v202-${n}-${suffix}`, { jpeg: true });
  const api = ctx.base.replace("crm-", "api-");
  const call = (method, url, body) =>
    page.evaluate(
      async (api, method, url, body) => {
        const r = await fetch(api + url, {
          method,
          credentials: "include",
          headers: body ? { "Content-Type": "application/json" } : {},
          body: body ? JSON.stringify(body) : undefined,
        });
        const text = await r.text();
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {}
        return { status: r.status, json, text: json ? null : text.slice(0, 200) };
      },
      api,
      method,
      url,
      body ?? null,
    );
  const click = (re, sel = "button") =>
    page.evaluate(
      (src, sel) => {
        const rx = new RegExp(src);
        const els = [...document.querySelectorAll(sel)].filter((x) => {
          const r = x.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && rx.test((x.textContent || "").trim());
        });
        const el = els.sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.click();
        return el ? (el.textContent || "").trim().slice(0, 50) : null;
      },
      re.source,
      sel,
    );
  const text = () => page.evaluate(() => document.body.innerText);
  const overflowX = () =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  if (phase === "setup") {
    const sc = await call("POST", "/api/scooters", {
      name: "ТЕСТ разборка",
      model: "jog",
      modelId: 1,
      baseStatus: "disassembly",
      note: "ТЕСТ shotbot — кадры 2.0.2, удалить",
    });
    console.log("скутер:", sc.status, sc.json?.id ?? sc.json ?? sc.text);
    const so = await call("POST", "/api/service-orders", {
      customerName: "ТЕСТ shotbot",
      customerPhone: "+7 900 000-00-00",
      vehicle: "Honda Dio (тест)",
      complaint: "Кадры 2.0.2 — удалить",
    });
    const orderId = so.json?.order?.id;
    console.log("ремонт:", so.status, orderId);
    await call("POST", `/api/service-orders/${orderId}/items`, { kind: "work", name: "Диагностика", price: 500 });
    const c = await call("POST", `/api/service-orders/${orderId}/cancel`, {});
    console.log("отмена:", c.status, c.json?.order?.status);
    fs.writeFileSync(IDS, JSON.stringify({ scooterId: sc.json?.id, orderId }, null, 2));
    return;
  }

  if (phase === "clean") {
    const ids = JSON.parse(fs.readFileSync(IDS, "utf8"));
    if (ids.orderId) console.log("ремонт:", (await call("DELETE", `/api/service-orders/${ids.orderId}`)).status);
    if (ids.scooterId) console.log("скутер:", (await call("DELETE", `/api/scooters/${ids.scooterId}`)).status);
    return;
  }

  const ids = fs.existsSync(IDS) ? JSON.parse(fs.readFileSync(IDS, "utf8")) : {};

  if (phase === "desk") {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(5000);

    // 1. Загрузка парка
    await ctx.gotoRoute("dashboard");
    await ctx.sleep(3000);
    const gauge = await page.evaluate(() => {
      const t = document.body.innerText;
      return { park: (t.match(/из \d+ в парке/g) || []).join(" | "), pct: (t.match(/\d+%/) || [])[0] };
    });
    console.log("загрузка:", JSON.stringify(gauge));
    await S("load");

    // 2. Ремонты — список и цифры
    await ctx.gotoRoute("service");
    await ctx.sleep(3000);
    const kpi = await page.evaluate(() => {
      const t = document.body.innerText;
      const pick = (label) => {
        const i = t.indexOf(label);
        return i >= 0 ? t.slice(i, i + 60).replace(/\n/g, " ") : null;
      };
      return { выручка: pick("ВЫРУЧКА"), ждём: pick("ЖДЁМ ОПЛАТУ") };
    });
    console.log("цифры:", JSON.stringify(kpi));
    await S("sv-list");

    // 3. Ремонт в работе
    await click(/Владимир/);
    await ctx.sleep(1500);
    await S("sv-card");
    // 4. Оплата
    await click(/^Принять оплату/);
    await ctx.sleep(800);
    await S("sv-pay");
    await click(/^Отмена$/);
    await ctx.sleep(400);
    await page.keyboard.press("Escape");
    await page.mouse.click(40, 450);
    await ctx.sleep(800);

    // 5. Новый ремонт
    await click(/Новый ремонт/);
    await ctx.sleep(800);
    await S("sv-new");
    await click(/^Отмена$/);
    await ctx.sleep(500);

    // 6. Отменённый ремонт
    await click(/ТЕСТ shotbot/);
    await ctx.sleep(1200);
    const cancelled = await page.evaluate(() => ({
      статус: /Отменён/.test(document.body.innerText),
      вернуть: /Вернуть в работу/.test(document.body.innerText),
    }));
    console.log("отменённый:", JSON.stringify(cancelled));
    await S("sv-cancelled");
    await page.mouse.click(40, 450);
    await ctx.sleep(600);

    // 7. Новая аренда — способ оплаты
    await ctx.gotoRoute("dashboard");
    await ctx.sleep(1500);
    await click(/Новая сделка/);
    await ctx.sleep(700);
    await click(/Скутер напрокат/);
    await ctx.sleep(1500);
    await page.evaluate(() => {
      const el = [...document.querySelectorAll("div")].find((d) => /^Способ оплаты/.test((d.textContent || "").trim()) && d.children.length <= 2);
      el?.scrollIntoView({ block: "center" });
    });
    await ctx.sleep(600);
    const pay = await page.evaluate(() => ({
      кнопки: [...document.querySelectorAll("button")].map((b) => (b.textContent || "").trim()).filter((s) => /^(Наличные|Безнал|Перевод|Разделить)$/.test(s)),
    }));
    console.log("аренда:", JSON.stringify(pay));
    await S("rent-pay");
    await page.keyboard.press("Escape");
    await ctx.sleep(500);
    return;
  }

  if (phase === "phone") {
    await page.setUserAgent(PHONE_UA);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(5000);
    await S("load-m");

    await ctx.gotoRoute("service");
    await ctx.sleep(3000);
    console.log("ремонты телефон:", JSON.stringify({ overflowX: await overflowX() }));
    await S("sv-list-m");
    await click(/Владимир/);
    await ctx.sleep(1500);
    await S("sv-card-m");
    await page.evaluate(() => {
      const sc = [...document.querySelectorAll(".overflow-y-auto")].pop();
      sc?.scrollTo(0, sc.scrollHeight);
    });
    await ctx.sleep(500);
    await S("sv-card-m2");
    void ids;
    void text;
  }
}
