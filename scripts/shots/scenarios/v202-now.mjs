/**
 * Выпуск 2.0.2 — кадры «стало» и живая проверка на превью (17.09).
 *   PHASE=desk   — компьютер 1440×900: новый ремонт, аванс, накладная,
 *                  отмена и возврат в работу, смешанная оплата аренды
 *   PHASE=phone  — телефон 390×844 (PHONE_W=360 — узкий)
 *   PHASE=tablet — планшет лёжа 1180×820 / стоя 820×1180 (TAB=portrait)
 * Тестовый ремонт «ТЕСТ shotbot 2.0.2» — id в scripts/shots/out/v202-test.json,
 * удаляется PHASE=clean сценария v202-was.
 */
import fs from "node:fs";
import path from "node:path";

const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const IDS = path.resolve("scripts/shots/out/v202-test.json");

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const tag = process.env.TAG ?? "";
  const S = (n) => ctx.shot(`v202-${n}${tag}-now`, { jpeg: true });
  const sleep = ctx.sleep;
  const ids = fs.existsSync(IDS) ? JSON.parse(fs.readFileSync(IDS, "utf8")) : {};
  const saveIds = () => fs.writeFileSync(IDS, JSON.stringify(ids, null, 2));

  const click = (re, scope = "body", sel = "button") =>
    page.evaluate(
      (src, scope, sel) => {
        const rx = new RegExp(src);
        const root = document.querySelector(scope) ?? document.body;
        const els = [...root.querySelectorAll(sel)].filter((x) => {
          const r = x.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && rx.test((x.textContent || "").trim());
        });
        const el = els.sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.scrollIntoView({ block: "center" });
        el?.click();
        return el ? (el.textContent || "").trim().slice(0, 50) : null;
      },
      re.source,
      scope,
      sel,
    );
  const typeInto = async (selector, text, { clear = true } = {}) => {
    const h = await page.$(selector);
    if (!h) throw new Error("нет поля " + selector);
    await h.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await h.click();
    if (clear) {
      await h.evaluate((el) => el.select?.());
      await page.keyboard.down("Control");
      await page.keyboard.press("KeyA");
      await page.keyboard.up("Control");
      await page.keyboard.press("Backspace");
    }
    await h.type(text, { delay: 8 });
  };
  const info = () =>
    page.evaluate(() => {
      const t = document.body.innerText;
      const btns = [...document.querySelectorAll("button")].filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const small = btns
        .filter((b) => b.closest("[data-service-card],[data-service-form],[data-pay-sheet],[data-rental-pay]"))
        .filter((b) => b.getBoundingClientRect().height < 40)
        .map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 20));
      return {
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        small: [...new Set(small)].slice(0, 8),
        text: t.length,
      };
    });
  const scrollPanel = (sel, to = "end") =>
    page.evaluate(
      (sel, to) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        el.scrollTo(0, to === "end" ? el.scrollHeight : 0);
        return true;
      },
      sel,
      to,
    );
  const money = () =>
    page.evaluate(() => {
      const box = document.querySelector("[data-money-block]");
      return box ? box.innerText.replace(/\n+/g, " | ") : null;
    });

  const touch = phase !== "desk";
  const vp =
    phase === "desk"
      ? { width: 1440, height: 900, deviceScaleFactor: 1 }
      : phase === "phone"
        ? { width: Number(process.env.PHONE_W ?? 390), height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : process.env.TAB === "portrait"
          ? { width: 820, height: 1180, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
          : { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
  if (phase === "phone") await page.setUserAgent(PHONE_UA);
  if (phase === "tablet") await page.setUserAgent(IPAD_UA);
  await page.setViewport(vp);
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await sleep(5500);

  /* ---------- 1. Загрузка парка ---------- */
  if (phase !== "tablet") {
    await ctx.gotoRoute("dashboard");
    await sleep(2500);
    const g = await page.evaluate(() => {
      const t = document.body.innerText;
      return { park: (t.match(/из \d+ в парке/g) || []).join(" | "), pct: (t.match(/\d+%/g) || []).slice(0, 2).join(" ") };
    });
    console.log("загрузка:", JSON.stringify(g));
    await S(phase === "phone" ? "load-m" : "load");
  }

  /* ---------- 2. Ремонты: список ---------- */
  await ctx.gotoRoute("service");
  await sleep(3000);
  const kpi = await page.evaluate(() => {
    const t = document.body.innerText.replace(/\n/g, " ");
    const pick = (l) => {
      const i = t.indexOf(l);
      return i >= 0 ? t.slice(i, i + 64) : null;
    };
    return { выручка: pick("ВЫРУЧКА"), прибыль: pick("ПРИБЫЛЬ"), ждём: pick("ЖДЁМ ОПЛАТУ") };
  });
  console.log("цифры:", JSON.stringify(kpi));
  const sfx = phase === "phone" ? "-m" : phase === "tablet" ? "-t" : "";
  await S(`sv-list${sfx}`);

  /* ---------- 3. Новый ремонт ---------- */
  await click(/Новый ремонт/);
  await sleep(900);
  await S(`sv-form-empty${sfx}`);
  // Сохранить пустую — подсветка обязательных
  await click(/^Сохранить — в работе$/);
  await sleep(400);
  console.log("пустая форма:", await page.evaluate(() => /Заполните имя клиента и технику/.test(document.body.innerText)));

  await typeInto('input[placeholder="Как зовут клиента"]', "ТЕСТ shotbot 2.0.2");
  await typeInto('input[placeholder="+7 ..."]', "+7 900 000-20-02");
  await typeInto('input[placeholder="Honda Dio AF62"]', "Honda Dio AF34");
  await typeInto('textarea[placeholder^="Не заводится"]', "Не заводится, течёт масло");
  // Работа из прайса
  await click(/Из прайса/, "[data-service-form]");
  await sleep(900);
  const priced = await page.evaluate(() => {
    const box = document.querySelector("[data-price-picker]");
    const btns = [...(box?.querySelectorAll("button") ?? [])].filter((b) => /₽/.test(b.textContent || ""));
    btns[0]?.click();
    btns[1]?.click();
    return btns.slice(0, 2).map((b) => (b.textContent || "").trim().slice(0, 40));
  });
  await sleep(500);
  console.log("из прайса:", JSON.stringify(priced));
  await S(`sv-picker${sfx}`);
  await click(/^Готово/, "[data-price-picker]");
  await sleep(500);
  // Своя работа
  await typeInto('[data-section="work"] input[placeholder="Своя работа — название"]', "Чистка карбюратора");
  const workPrice = touch ? '[data-section="work"] input[placeholder="0"]' : '[data-section="work"] input[placeholder="цена"]';
  await typeInto(workPrice, "800");
  await page.keyboard.press("Enter");
  await sleep(300);
  // Запчасть
  await typeInto('[data-section="part"] input[placeholder="Запчасть — наименование"]', "Сальник коленвала");
  const partCost = touch ? '[data-section="part"] input[placeholder="0"]' : '[data-section="part"] input[placeholder="закуп"]';
  const partPrice = touch ? '[data-section="part"] input[placeholder="= закуп"]' : '[data-section="part"] input[placeholder="цена"]';
  await typeInto(partCost, "250");
  await typeInto(partPrice, "450");
  await page.keyboard.press("Enter");
  await sleep(300);
  // Количество запчасти +1
  await page.evaluate(() => {
    const row = document.querySelector('[data-section="part"] [data-item-row]');
    [...(row?.querySelectorAll("button") ?? [])].find((b) => b.getAttribute("aria-label") === "Больше")?.click();
  });
  await sleep(300);
  // Аванс
  await page.evaluate(() => document.querySelector('[data-form-money] button[role="switch"]')?.click());
  await sleep(400);
  await click(/^Половина/, "[data-form-money]");
  await sleep(400);
  const formMoney = await page.evaluate(() => document.querySelector("[data-form-money]")?.innerText.replace(/\n+/g, " | "));
  console.log("форма, деньги:", formMoney);
  console.log("форма, вёрстка:", JSON.stringify(await info()));
  await scrollPanel("[data-service-form]", "top");
  await sleep(300);
  await S(`sv-form-top${sfx}`);
  await scrollPanel("[data-service-form]", "end");
  await sleep(300);
  await S(`sv-form${sfx}`);

  // Черновик переживает F5
  if (phase === "desk") {
    await page.reload({ waitUntil: "domcontentloaded" });
    await sleep(5000);
    await ctx.gotoRoute("service");
    await sleep(2500);
    await click(/Новый ремонт/);
    await sleep(900);
    const kept = await page.evaluate(() => ({
      баннер: /Продолжаем черновик/.test(document.body.innerText),
      имя: document.querySelector('input[placeholder="Как зовут клиента"]')?.value,
      позиций: document.querySelectorAll("[data-service-form] [data-item-row]").length,
    }));
    console.log("после F5:", JSON.stringify(kept));
  }

  await click(/^Сохранить — в работе$/);
  await sleep(1800);
  const toastText = await page.evaluate(() => {
    const t = document.body.innerText;
    const i = t.indexOf("сохранён — в работе");
    return i >= 0 ? t.slice(Math.max(0, i - 20), i + 120).replace(/\n/g, " ") : null;
  });
  console.log("тост:", toastText);
  await S(`sv-saved${sfx}`);
  const row = await page.evaluate(() => {
    const r = [...document.querySelectorAll("[data-order-row]")].find((x) => /ТЕСТ shotbot 2\.0\.2/.test(x.textContent || ""));
    return r ? { number: Number(r.getAttribute("data-order-row")), text: r.innerText.replace(/\n+/g, " | ") } : null;
  });
  console.log("строка:", JSON.stringify(row));
  const newId = await page.evaluate(async (api) => {
    const r = await fetch(api + "/api/service-orders", { credentials: "include" });
    const d = await r.json();
    return d.orders.find((o) => o.customerName === "ТЕСТ shotbot 2.0.2" && o.status !== "paid")?.id ?? null;
  }, ctx.base.replace("crm-", "api-"));
  ids.newOrders = [...new Set([...(ids.newOrders ?? []), newId].filter(Boolean))];
  saveIds();

  /* ---------- 4. Карточка ---------- */
  await click(/^Открыть$/);
  await sleep(1200);
  if (!(await page.$("[data-service-card]"))) {
    await click(/ТЕСТ shotbot 2\.0\.2/, "body", "[data-order-row]");
    await sleep(1200);
  }
  console.log("карточка, деньги:", await money());
  console.log("карточка, вёрстка:", JSON.stringify(await info()));
  await S(`sv-card${sfx}`);

  // Правка клиента
  await click(/^Изменить$/, "[data-client-block]");
  await sleep(500);
  await S(`sv-edit${sfx}`);
  await typeInto('[data-client-edit] input[inputmode="tel"]', "+7 900 000-20-03");
  await click(/^Сохранить$/, "[data-client-edit]");
  await sleep(1200);
  console.log("после правки:", await page.evaluate(() => document.querySelector("[data-client-block]")?.innerText.replace(/\n+/g, " | ")));

  // Аванс
  await click(/^Аванс$/, "[data-service-card] footer");
  await sleep(700);
  await click(/^1\s000 ₽$/, "[data-pay-sheet]");
  await sleep(300);
  await S(`sv-advance${sfx}`);
  await click(/^Принять аванс/, "[data-pay-sheet]");
  await sleep(1500);
  console.log("после аванса:", await money());
  await scrollPanel("[data-service-card] .overflow-y-auto", "end");
  await sleep(300);
  await S(`sv-card-money${sfx}`);

  // Оплата со скидкой — только смотрим
  await click(/^Принять оплату/, "[data-service-card] footer");
  await sleep(700);
  const left = await page.evaluate(() => Number(document.querySelector("[data-pay-sheet] input")?.value || 0));
  await typeInto("[data-pay-sheet] input", String(Math.max(0, left - 200)));
  await sleep(300);
  console.log("оплата со скидкой:", await page.evaluate(() => document.querySelector("[data-pay-sheet]")?.innerText.replace(/\n+/g, " | ").slice(0, 300)));
  await S(`sv-settle${sfx}`);
  await click(/^Отмена$/, "[data-pay-sheet]");
  await sleep(400);

  if (phase === "desk") {
    // Накладная
    await click(/Накладная/, "[data-service-card] header");
    await sleep(3000);
    await S("sv-invoice");
    await page.keyboard.press("Escape");
    await sleep(600);
  } else {
    await page.evaluate(() => document.querySelector('[data-service-card] header button[aria-label="Накладная"]')?.click());
    await sleep(3000);
    await S(`sv-invoice${sfx}`);
    await page.keyboard.press("Escape");
    await sleep(600);
  }

  // Отмена и возврат в работу
  await click(/^Отменить ремонт$/, "[data-service-card]");
  await sleep(600);
  await S(`sv-cancel-ask${sfx}`);
  await click(/Вернули деньги — отменить|^Отменить ремонт$/, 'div[class*="z-[1100]"]');
  await sleep(1500);
  const canc = await page.evaluate(() => ({
    статус: document.querySelector("[data-service-card]")?.innerText.includes("Отменён"),
    кнопка: /Вернуть в работу/.test(document.body.innerText),
  }));
  console.log("отменён:", JSON.stringify(canc));
  await scrollPanel("[data-service-card] .overflow-y-auto", "top");
  await S(`sv-cancelled${sfx}`);
  await click(/Вернуть в работу/, "[data-service-card]");
  await sleep(700);
  await S(`sv-reopen${sfx}`);
  await click(/Деньги у нас/);
  await sleep(1500);
  console.log("вернули в работу:", await money());

  /* ---------- 5. Новая аренда: Разделить ---------- */
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelector('[data-service-card] header button[aria-label="Закрыть"]')?.click());
  await sleep(600);
  if (phase === "desk") {
    await ctx.gotoRoute("dashboard");
    await sleep(1500);
    await click(/Новая сделка/);
    await sleep(700);
    await click(/Скутер напрокат/);
    await sleep(1500);
    await click(/^Разделить$/, "[data-rental-pay]");
    await sleep(500);
    await page.evaluate(() => document.querySelector("[data-rental-pay]")?.scrollIntoView({ block: "center" }));
    await sleep(300);
    console.log("аренда, оплата:", await page.evaluate(() => document.querySelector("[data-rental-pay]")?.innerText.replace(/\n+/g, " | ")));
    await S("rent-pay");
    await page.keyboard.press("Escape");
    await sleep(500);
  }
}
