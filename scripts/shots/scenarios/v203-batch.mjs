/**
 * 2.0.3 — правка партии после создания («Скутеры → Партии»).
 *   PHASE=setup  — тестовая партия shotbot «ТЕСТ партия shotbot»: 4 × Gear,
 *                  «Пока не решили»; id → scripts/shots/out/v203-test.json
 *   PHASE=desk | phone | tablet (+ WHEN=was | now) — кадры
 *   Уборка — SQL (своя тестовая техника и её журнал), см. отчёт.
 * Кадры — public/progress/v203-*.jpg
 */
import fs from "node:fs";
import path from "node:path";

const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const IDS = path.resolve("scripts/shots/out/v203-test.json");
const BATCH = "ТЕСТ партия shotbot";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const when = process.env.WHEN ?? "now";
  const tag = process.env.TAG ?? "";
  const sfx = phase === "phone" ? "-m" : phase === "tablet" ? "-t" : "";
  const S = (n) => ctx.shot(`v203-${n}${sfx}${tag}-${when}`, { jpeg: true });
  const sleep = ctx.sleep;
  const api = process.env.SHOT_API ?? ctx.base.replace("crm-", "api-");
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
        return { status: r.status, json, text: json ? null : text.slice(0, 300) };
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
          return r.width > 0 && r.height > 0 && !x.disabled && rx.test((x.textContent || "").trim());
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
    if (text) await h.type(text, { delay: 20 });
  };
  const quiet = async () => {
    await page.evaluate(() =>
      document.querySelectorAll('[role="alert"] button[aria-label="Закрыть"]').forEach((b) => b.click()),
    );
    await sleep(300);
  };

  /* ---------------- подготовка ---------------- */
  if (phase === "setup") {
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await sleep(4000);
    const models = await call("GET", "/api/scooter-models");
    const list = models.json?.items ?? models.json ?? [];
    const gear = list.find((m) => /gear/i.test(m.name) && m.active !== false);
    console.log("модель:", gear?.id, gear?.name, "аренда:", gear?.forRent, "продажа:", gear?.forSale);
    const r = await call("POST", "/api/scooters/batch", {
      modelId: gear.id,
      baseStatus: "ready",
      purchaseBatch: BATCH,
      purchaseDate: "2026-09-10",
      purchasePrice: 60000,
      units: [
        { color: "Чёрный", year: 2021 },
        { color: "Чёрный", year: 2021 },
        { color: "Белый", year: 2022 },
        { color: "Синий", year: 2022 },
      ],
    });
    console.log("партия:", r.status, r.text ?? "");
    const ids = (r.json?.items ?? []).map((s) => s.id);
    fs.mkdirSync(path.dirname(IDS), { recursive: true });
    fs.writeFileSync(IDS, JSON.stringify({ ids, modelId: gear.id }, null, 2));
    console.log("id:", ids.join(", "));
    return;
  }

  /* ---------------- экран ---------------- */
  if (phase === "phone") await page.setUserAgent(PHONE_UA);
  if (phase === "tablet") await page.setUserAgent(IPAD_UA);
  await page.setViewport(
    phase === "desk"
      ? { width: 1440, height: 900, deviceScaleFactor: 1 }
      : phase === "phone"
        ? { width: Number(process.env.PHONE_W ?? 390), height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : { width: Number(process.env.TAB_W ?? 1180), height: Number(process.env.TAB_H ?? 820), deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  );
  await page.evaluate(() => localStorage.setItem("hulk.garageTab", "batches"));
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await sleep(5500);
  await ctx.gotoRoute("fleet");
  await sleep(2200);
  if (phase !== "desk") {
    console.log("кнопка «Партии»:", await click(/^Партии$/));
    await sleep(1200);
  }
  await typeInto('input[placeholder^="Партия, модель или рама"]', "ТЕСТ партия");
  await sleep(700);
  const card = await page.evaluate(() => {
    const h = [...document.querySelectorAll("h3")].find((x) => /ТЕСТ партия/.test(x.textContent || ""));
    const sec = h?.closest("section");
    return sec ? sec.innerText.replace(/\n+/g, " | ").slice(0, 300) : null;
  });
  console.log("карточка партии:", card);
  await S("batch-card");

  if (when === "was") {
    await click(/^Единицы · 4$/);
    await sleep(600);
    await S("batch-units");
    return;
  }

  /* ---------------- на превью: ключ директора при смене статуса ---------------- */
  if (when === "gate") {
    await page.evaluate(() => {
      const h = [...document.querySelectorAll("h3")].find((x) => /ТЕСТ партия/.test(x.textContent || ""));
      h?.closest("section")?.querySelector("[data-batch-edit-open]")?.click();
    });
    await sleep(900);
    await click(/^На продажу/, "[data-batch-targets]");
    await sleep(500);
    await click(/^Сохранить$/, "[data-batch-edit]");
    await sleep(2500);
    const gate = await page.evaluate(() => {
      const d = [...document.querySelectorAll('div[class*="z-[190]"]')].pop();
      return d ? d.innerText.replace(/\n+/g, " | ").slice(0, 400) : null;
    });
    console.log("окно ключа:", gate);
    await S("gate");
    await page.evaluate(() => {
      const d = [...document.querySelectorAll('div[class*="z-[190]"]')].pop();
      d?.querySelector('button[aria-label="Отмена"]')?.click();
    });
    await sleep(1200);
    const after = await page.evaluate(() => document.querySelector("[data-batch-edit]")?.innerText.match(/Статус не изменён[^\n]*/)?.[0] ?? null);
    console.log("после отмены ключа:", after);
    await S("gate-cancel");
    return;
  }

  /* ---------------- стало: правка партии ---------------- */
  const setDate = (iso) =>
    page.evaluate((iso) => {
      const el = document.querySelector("[data-batch-date]");
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(el, iso);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, iso);
  const state = () =>
    page.evaluate(() => ({
      summary: document.querySelector("[data-batch-summary]")?.textContent?.trim(),
      picked: [...document.querySelectorAll('[data-batch-units] [role="checkbox"]')].map((b) => b.getAttribute("aria-checked") + (b.disabled ? "/нельзя" : "")),
      notes: [...document.querySelectorAll("[data-batch-status] .rounded-xl.border")].map((n) => n.textContent?.trim()).filter(Boolean),
      overflow: document.querySelector("[data-batch-edit]")
        ? [...document.querySelectorAll("[data-batch-edit] *")].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === "visible" && e.children.length === 0).length
        : null,
    }));
  const openEdit = async () => {
    await page.evaluate(() => {
      const h = [...document.querySelectorAll("h3")].find((x) => /ТЕСТ партия/.test(x.textContent || ""));
      h?.closest("section")?.querySelector("[data-batch-edit-open]")?.click();
    });
    await sleep(900);
  };

  await openEdit();
  console.log("окно открыто:", JSON.stringify(await state()));
  await S("edit-open");

  await typeInto("[data-batch-name]", "ТЕСТ партия shotbot · сентябрь");
  await setDate("2026-09-12");
  if (await page.$("[data-batch-cost]")) await typeInto("[data-batch-cost]", "58000");
  await sleep(400);
  console.log("общее:", JSON.stringify(await state()));
  await S("edit-fields");

  await click(/^На продажу/, "[data-batch-targets]");
  await sleep(500);
  // четвёртую оставляем «не решили»
  await page.evaluate(() => [...document.querySelectorAll('[data-batch-units] [role="checkbox"]')][3]?.click());
  await sleep(300);
  await typeInto("[data-batch-sale-input]", "95000");
  await sleep(400);
  await page.evaluate(() => document.querySelector("[data-batch-status]")?.scrollIntoView({ block: "start" }));
  await sleep(300);
  console.log("на продажу:", JSON.stringify(await state()));
  await S("edit-status");
  await page.evaluate(() => document.querySelector("[data-batch-sale]")?.scrollIntoView({ block: "end" }));
  await sleep(300);
  await S("edit-sale");

  page.on("response", async (res) => {
    if (!res.url().includes("/batch/edit")) return;
    let t = "";
    try {
      t = (await res.text()).slice(0, 300);
    } catch {}
    console.log("ответ сервера:", res.status(), t);
  });
  const saveBtn = await page.evaluate(() => {
    const b = [...document.querySelectorAll("[data-batch-edit] button")].find((x) => (x.textContent || "").trim() === "Сохранить");
    return b ? { disabled: b.disabled } : null;
  });
  console.log("кнопка «Сохранить»:", JSON.stringify(saveBtn));
  await click(/^Сохранить$/, "[data-batch-edit]");
  await sleep(2500);
  const toastText = await page.evaluate(() => [...document.querySelectorAll('[role="alert"]')].map((a) => a.innerText.replace(/\n/g, " ")).join(" | "));
  const stillOpen = await page.evaluate(() => document.querySelector("[data-batch-edit]")?.innerText.slice(-400) ?? null);
  console.log("уведомление:", toastText, "| окно:", stillOpen ? "открыто — " + stillOpen.replace(/\n+/g, " / ") : "закрыто");
  if (stillOpen) await S("save-error");
  await typeInto('input[placeholder^="Партия, модель или рама"]', "ТЕСТ партия");
  await sleep(700);
  await S("saved");
  await quiet();
  const card2 = await page.evaluate(() => {
    const h = [...document.querySelectorAll("h3")].find((x) => /ТЕСТ партия/.test(x.textContent || ""));
    return h?.closest("section")?.innerText.replace(/\n+/g, " | ").slice(0, 320);
  });
  console.log("карточка после:", card2);

  // В аренду — оставшуюся
  await openEdit();
  await click(/^В аренду/, "[data-batch-targets]");
  await sleep(500);
  await page.evaluate(() => document.querySelector("[data-batch-status]")?.scrollIntoView({ block: "start" }));
  await sleep(300);
  console.log("в аренду, все:", JSON.stringify(await state()));
  await S("edit-rent-short");
  // оставляем одну — четвёртую, «не решили»
  await click(/^Снять все$/, "[data-batch-edit]");
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll('[data-batch-units] [role="checkbox"]')][3]?.click());
  await sleep(400);
  console.log("в аренду, одна:", JSON.stringify(await state()));
  await S("edit-rent");
  await click(/^Сохранить$/, "[data-batch-edit]");
  await sleep(2200);
  console.log(
    "уведомление:",
    await page.evaluate(() => [...document.querySelectorAll('[role="alert"]')].map((a) => a.innerText.replace(/\n/g, " ")).join(" | ")),
  );
  await quiet();
  await typeInto('input[placeholder^="Партия, модель или рама"]', "ТЕСТ партия");
  await sleep(600);
  await click(/^Единицы · 4$/);
  await sleep(600);
  await S("after-units");
}
