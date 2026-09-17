/**
 * 2.0.2 — прайс запчастей в интерфейсе: «Документы → Прейскурант», выбор из
 * прайса в ремонте, подсказка по названию, своя запчасть → прайс.
 *   PHASE=desk | phone (PHONE_W=360) | tablet
 * Создаёт ремонт «ТЕСТ прайс shotbot» и удаляет его в конце; своя тестовая
 * запчасть из прайса тоже удаляется.
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const tag = process.env.TAG ?? "";
  const sfx = phase === "phone" ? "-m" : phase === "tablet" ? "-t" : "";
  const S = (n) => ctx.shot(`v202-${n}${sfx}${tag}-now`, { jpeg: true });
  const sleep = ctx.sleep;
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
        return { status: r.status, json: await r.json().catch(() => null) };
      },
      api,
      method,
      url,
      body ?? null,
    );
  const click = (re, scope = "body") =>
    page.evaluate(
      (src, scope) => {
        const rx = new RegExp(src);
        const root = document.querySelector(scope) ?? document.body;
        const els = [...root.querySelectorAll("button")].filter((x) => {
          const r = x.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && rx.test((x.textContent || "").trim());
        });
        const el = els.sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.scrollIntoView({ block: "center" });
        el?.click();
        return el ? (el.textContent || "").trim().slice(0, 60) : null;
      },
      re.source,
      scope,
    );
  const typeInto = async (selector, text) => {
    const h = await page.$(selector);
    if (!h) throw new Error("нет поля " + selector);
    await h.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await h.click();
    await page.keyboard.down("Control");
    await page.keyboard.press("KeyA");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await h.type(text, { delay: 25 });
  };
  const quiet = async () => {
    await page.evaluate(() =>
      document.querySelectorAll('[role="alert"] button[aria-label="Закрыть"]').forEach((b) => b.click()),
    );
    await sleep(400);
  };

  const touch = phase !== "desk";
  if (phase === "phone") await page.setUserAgent(PHONE_UA);
  if (phase === "tablet") await page.setUserAgent(IPAD_UA);
  await page.setViewport(
    phase === "desk"
      ? { width: 1440, height: 900, deviceScaleFactor: 1 }
      : phase === "phone"
        ? { width: Number(process.env.PHONE_W ?? 390), height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  );
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await sleep(5500);

  /* ---- Документы → Прейскурант (компьютер) ---- */
  if (phase === "desk") {
    await ctx.gotoRoute("docs");
    await sleep(2500);
    await click(/^Прейскурант$/);
    await sleep(2000);
    await page.evaluate(() => document.querySelector('[data-price-tab="part"]')?.click());
    await sleep(1500);
    const docInfo = await page.evaluate(() => ({
      tab: document.querySelector('[data-price-tab="part"]')?.textContent,
      zones: [...document.querySelectorAll("[data-zone-chips] button")].map((b) => b.textContent),
      heads: [...document.querySelectorAll("[data-zone-head]")].slice(0, 4).map((h) => h.textContent),
      cost: /Закуп/.test(document.body.innerText),
    }));
    console.log("прейскурант:", JSON.stringify(docInfo));
    await S("price-parts");
    await click(/^Двигатель$/, "[data-zone-chips]");
    await sleep(800);
    await S("price-parts-engine");
    await typeInto('input[placeholder^="Найти запчасть или модель"]', "ремень gear");
    await sleep(800);
    const found = await page.evaluate(() =>
      [...document.querySelectorAll("tbody tr td:first-child")].map((t) => t.textContent).slice(0, 5),
    );
    console.log("поиск «ремень gear»:", JSON.stringify(found));
    await S("price-parts-search");
  }

  /* ---- Ремонт ---- */
  const created = await call("POST", "/api/service-orders", {
    customerName: "ТЕСТ прайс shotbot",
    vehicle: "Yamaha Gear 4T",
    complaint: "Проверка прайса запчастей — удалить",
    items: [{ kind: "work", name: "Диагностика общая", price: 700 }],
  });
  const orderId = created.json?.order?.id;
  console.log("тестовый ремонт:", created.status, orderId);
  await ctx.gotoRoute("service");
  await sleep(2500);
  await click(/ТЕСТ прайс shotbot/, "body");
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("[data-order-row]")].find((r) => /ТЕСТ прайс shotbot/.test(r.textContent || ""));
    row?.click();
  });
  await sleep(1500);

  // Из прайса — запчасть
  await page.evaluate(() => {
    const sec = document.querySelector('[data-section="part"]');
    [...(sec?.querySelectorAll("button") ?? [])].find((b) => /Из прайса/.test(b.textContent || ""))?.click();
  });
  await sleep(1200);
  const pick = await page.evaluate(() => ({
    zones: [...document.querySelectorAll('[data-price-picker="part"] [data-zone-chips] button')].map((b) => b.textContent).slice(0, 14),
    first: [...document.querySelectorAll('[data-price-picker="part"] [data-zone-head]')].slice(0, 3).map((h) => h.textContent),
  }));
  console.log("выбор из прайса:", JSON.stringify(pick));
  await S("parts-picker");
  // Трансмиссия → ремень Gear
  await page.evaluate(() => {
    [...document.querySelectorAll('[data-price-picker="part"] [data-zone-chips] button')].find((b) => b.textContent === "Трансмиссия")?.click();
  });
  await sleep(700);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-price-picker="part"] button')].find((x) => /810×17,5/.test(x.textContent || ""));
    b?.scrollIntoView({ block: "center" });
    b?.click();
  });
  await sleep(1200);
  await S("parts-picker-picked");
  await click(/^Готово/, '[data-price-picker="part"]');
  await sleep(1000);

  // Подсказка по первым буквам
  await typeInto('[data-add-name="part"]', "сальник вил");
  await sleep(900);
  const sugg = await page.evaluate(() => [...document.querySelectorAll('[role="listbox"] [role="option"]')].map((o) => o.textContent).slice(0, 5));
  console.log("подсказки «сальник вил»:", JSON.stringify(sugg));
  await S("parts-suggest");
  await page.evaluate(() => document.querySelector('[role="listbox"] [role="option"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await sleep(600);
  const filled = await page.evaluate(() => {
    const row = document.querySelector('[data-add-row="part"]');
    return {
      status: row?.innerText.includes("Из прайса запчастей"),
      values: [...(row?.querySelectorAll('input[inputmode="numeric"]') ?? [])].map((i) => i.value),
    };
  });
  console.log("выбрали подсказку:", JSON.stringify(filled));
  await page.keyboard.press("Escape");

  // Своя запчасть — новая, сохранится в прайс
  await typeInto('[data-add-name="part"]', "ТЕСТ Кронштейн особый");
  await page.keyboard.press("Escape");
  await sleep(500);
  const own = await page.evaluate(() => ({
    toggle: !!document.querySelector('[data-add-row="part"] [data-save-to-price] button[role="switch"][aria-checked="true"]'),
    text: document.querySelector('[data-add-row="part"] [data-save-to-price]')?.textContent,
  }));
  console.log("своя запчасть:", JSON.stringify(own));
  await S("parts-own");
  const priceSel = touch ? '[data-add-row="part"] input[placeholder="= закуп"]' : '[data-add-row="part"] input[placeholder="цена"]';
  await typeInto(priceSel, "650");
  await page.keyboard.press("Enter");
  await sleep(1800);
  const toastText = await page.evaluate(() => [...document.querySelectorAll('[role="alert"]')].map((a) => a.innerText.replace(/\n/g, " ")).join(" | "));
  console.log("уведомление:", toastText);
  await S("parts-saved");
  await quiet();
  const money = await page.evaluate(() => document.querySelector('[data-section="part"]')?.innerText.replace(/\n+/g, " | ").slice(0, 400));
  console.log("запчасти в ремонте:", money);
  await page.evaluate(() => document.querySelector('[data-section="part"]')?.scrollIntoView({ block: "start" }));
  await sleep(400);
  await S("parts-in-card");
  // Правка названия: тап по названию → поле → Enter
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-section="part"] [data-item-row] button')].find((x) => x.textContent === "ТЕСТ Кронштейн особый");
    b?.click();
  });
  await sleep(300);
  await page.keyboard.type(" 2", { delay: 25 });
  await page.keyboard.press("Enter");
  await sleep(1500);
  const renamed = await page.evaluate(() =>
    [...document.querySelectorAll('[data-section="part"] [data-item-row]')].map((r) => {
      const n = r.querySelector("button, span");
      return { name: n?.textContent, h: Math.round(n?.getBoundingClientRect().height ?? 0) };
    }),
  );
  console.log("названия:", JSON.stringify(renamed));

  // Уборка
  const pl = await call("GET", "/api/price-list?kind=part");
  const inbox = pl.json?.groups?.find((g) => g.name === "Добавлено из ремонтов");
  for (const it of inbox?.items ?? []) if (/^ТЕСТ /.test(it.name)) await call("DELETE", `/api/price-list/items/${it.id}`);
  if (inbox && inbox.items.every((i) => /^ТЕСТ /.test(i.name))) await call("DELETE", `/api/price-list/groups/${inbox.id}`);
  if (orderId) console.log("удалён ремонт:", (await call("DELETE", `/api/service-orders/${orderId}`)).status);
}
