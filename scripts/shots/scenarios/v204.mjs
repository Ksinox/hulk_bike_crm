/**
 * Выпуск 2.0.4 (правки 7.0) — кадры «было/стало».
 *   PHASE=desk | phone | tablet, WHEN=was | now, ONLY=fleet,rent,repairs,…
 *
 * Разделы:
 *   fleet   — «Скутеры» → «Продажа»: подпись модели под SEM (п.9)
 *   rent    — «Новая сделка» → «Скутер напрокат»: кнопки моделей (п.6)
 *   repairs — «Ремонты»: плашки, готовый ремонт (п.2, 3, 10, 11)
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const when = process.env.WHEN ?? "now";
  const only = (process.env.ONLY ?? "").split(",").filter(Boolean);
  const want = (s) => only.length === 0 || only.includes(s);
  const sfx = phase === "phone" ? "-m" : phase === "tablet" ? "-t" : "";
  const S = (n) => ctx.shot(`v204-${n}${sfx}-${when}`, { jpeg: true });
  const sleep = ctx.sleep;
  const click = (re, scope = "body") =>
    page.evaluate(
      (src, scope) => {
        const rx = new RegExp(src);
        const root = document.querySelector(scope) ?? document.body;
        const el = [...root.querySelectorAll("button, [role=button]")]
          .filter((x) => {
            const r = x.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && rx.test((x.textContent || "").trim());
          })
          .sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.click();
        return el ? (el.textContent || "").trim().slice(0, 50) : null;
      },
      re.source,
      scope,
    );
  const text = (sel) => page.evaluate((sel) => document.querySelector(sel)?.innerText ?? null, sel);
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
  // Анимации мешают кадрам.
  await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}" });

  /* ---------- п.9: подпись модели в «Продаже» ---------- */
  if (want("fleet")) {
    await ctx.gotoRoute("fleet");
    await sleep(1500);
    console.log("режим:", await click(phase === "desk" ? /^Продажа$/ : /^Продажа/));
    await sleep(1500);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll("button, [role=button], a, div")]
        .filter((x) => /SEM/.test(x.textContent || "") && (x.textContent || "").length < 160)
        .map((x) => (x.textContent || "").replace(/\s+/g, " ").trim())
        .slice(-3),
    );
    console.log("строка SEM:", rows.join(" || "));
    await S("fleet-sale");
  }

  /* ---------- п.5: номера электро ---------- */
  if (want("numbers")) {
    await ctx.gotoRoute("fleet");
    await sleep(1500);
    console.log("режим:", await click(phase === "desk" ? /^Аренда$/ : /^Аренда/));
    await sleep(1500);
    const badges = await page.evaluate(() =>
      [...document.querySelectorAll("span")]
        .filter((x) => /^\d{1,3}$/.test((x.textContent || "").trim()) && x.className.includes("rounded-full") && x.className.includes("text-white"))
        .map((x) => `${(x.textContent || "").trim()}${x.getAttribute("data-slot-pool") === "electric" ? "э" : ""}`)
        .slice(0, 30),
    );
    console.log("кружки:", badges.join(" "));
    await S("fleet-numbers");
    // Электро на превью — партнёрские: их номера видны в «Партнёрке» и на главной.
    await ctx.gotoRoute("partners");
    await sleep(2500);
    await S("partner-numbers");
    await ctx.gotoRoute("dashboard");
    await sleep(3000);
    await page.evaluate(() => document.querySelector("[data-park-panel], [data-tour='park']")?.scrollIntoView({ block: "center" }));
    await sleep(600);
    await S("dash-numbers");
  }

  /* ---------- п.6: модели в новой аренде ---------- */
  if (want("rent")) {
    await ctx.gotoRoute("rentals");
    await sleep(1200);
    console.log("новая сделка:", await click(/Новая сделка|^Новая$/));
    await sleep(800);
    console.log("напрокат:", await click(/Скутер напрокат/));
    await sleep(1800);
    const chips = await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .map((b) => (b.textContent || "").trim())
        .filter((t) => /\(\d+\)$/.test(t))
        .join(" | "),
    );
    console.log("кнопки моделей:", chips);
    await S("rent-models");
    const jog = await click(/Jog \(\d+\)$/);
    console.log("нажали:", jog);
    await sleep(700);
    const list = await page.evaluate(() =>
      [...document.querySelectorAll("div")]
        .find((d) => d.className.includes("max-h-[160px]"))
        ?.innerText.replace(/\s+/g, " ")
        .slice(0, 300) ?? "нет сетки (телефон)",
    );
    console.log("свободные после «Jog»:", list);
    await S("rent-jog");
    await page.keyboard.press("Escape");
    await sleep(600);
  }

  /* ---------- п.15: закуп по моделям в партии ---------- */
  if (want("batches")) {
    await ctx.gotoRoute("fleet");
    await sleep(1500);
    console.log("вкладка:", await click(/^Партии/));
    await sleep(1800);
    await page.evaluate(() => {
      const card = [...document.querySelectorAll("section")].find((x) => /ТЕСТ партия shotbot/.test(x.textContent || ""));
      card?.scrollIntoView({ block: "center" });
    });
    await sleep(500);
    await S("batch-card");
    await page.evaluate(() => {
      const card = [...document.querySelectorAll("section")].find((x) => /ТЕСТ партия shotbot/.test(x.textContent || ""));
      card?.querySelector("[data-batch-edit-open]")?.click();
    });
    await sleep(1500);
    await page.evaluate(() => (document.querySelector("[data-batch-cost-models]") ?? document.querySelector("[data-batch-cost]"))?.scrollIntoView({ block: "center" }));
    await sleep(400);
    console.log("закуп:", await page.evaluate(() => (document.querySelector("[data-batch-cost-models]")?.innerText ?? document.querySelector("[data-batch-cost]")?.closest("label")?.innerText ?? "").replace(/\s+/g, " ").slice(0, 200)));
    await S("batch-cost");
    await page.keyboard.press("Escape");
    await sleep(500);
  }

  /* ---------- п.7: проданная сделка ---------- */
  if (want("sales")) {
    await ctx.gotoRoute("sales");
    await sleep(1500);
    console.log("вкладка:", await click(/^Сделки/));
    await sleep(1200);
    // Проданная сделка — строка/карточка с «Продана»
    const opened = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("tr, button")].filter((r) => /Продан/.test(r.textContent || "") && /Gear|Jog|SEM|Dio/.test(r.textContent || ""));
      const r = rows[0];
      r?.click();
      return r ? (r.textContent || "").replace(/\s+/g, " ").slice(0, 80) : null;
    });
    console.log("сделка:", opened);
    await sleep(1500);
    console.log("кнопка «Исправить»:", await page.evaluate(() => !!document.querySelector("[data-edit-signed]")));
    await S("sale-deal");
    if (when === "now") {
      await page.evaluate(() => document.querySelector("[data-edit-signed]")?.click());
      await sleep(900);
      console.log("форма:", (await text("[data-signed-edit]"))?.replace(/\n+/g, " | ").slice(0, 300));
      await S("sale-edit");
      await click(/^Отмена$/, "[data-signed-edit]");
      await sleep(500);
    }
  }

  /* ---------- п.12: план и факт на стене ---------- */
  if (want("analytics")) {
    await ctx.gotoRoute("analytics");
    await sleep(2500);
    console.log("раздел:", await click(/^Настройка стены$/));
    await sleep(2500);
    const plans = await page.evaluate(() =>
      [...document.querySelectorAll("[data-flip-key]")]
        .map((t) => (t.textContent || "").replace(/\s+/g, " ").trim())
        .filter((t) => t.includes("/"))
        .slice(0, 6),
    );
    console.log("плитки с планом:", plans.join(" || "));
    await S("wall-setup");
  }

  /* ---------- п.2, 3, 10, 11: ремонты ---------- */
  if (want("repairs")) {
    await ctx.gotoRoute("service");
    await sleep(2000);
    console.log("плашки:", (await text("main") ?? "").slice(0, 0));
    await S("repairs");
    // Готовый к выдаче тестовый ремонт
    const opened = await page.evaluate(() => {
      const row = [...document.querySelectorAll("[data-order-row]")].find((r) => /ТЕСТ shotbot/.test(r.textContent || ""));
      row?.click();
      return row?.getAttribute("data-order-row") ?? null;
    });
    console.log("открыли ремонт №", opened);
    await sleep(1500);
    const card = await page.evaluate(() => {
      const c = document.querySelector("[data-service-card]");
      return {
        lock: !!document.querySelector("[data-ready-lock]"),
        addBtns: [...(c?.querySelectorAll("button") ?? [])].filter((b) => /Добавить|из прайса/i.test(b.textContent || "")).length,
        uncomplete: !!document.querySelector("[data-uncomplete]"),
        edit: [...(c?.querySelectorAll("button") ?? [])].some((b) => /Изменить/.test(b.textContent || "")),
      };
    });
    console.log("карточка готового:", JSON.stringify(card));
    await S("repair-ready");
    if (when === "now") {
      // Откат директором
      await page.evaluate(() => document.querySelector("[data-uncomplete]")?.click());
      await sleep(700);
      await S("repair-confirm");
      console.log("подтвердили:", await click(/^Вернуть в работу$/));
      await sleep(1500);
      console.log("статус:", await text("[data-service-card] header"));
      // Механик в шапке
      await click(/^Изменить$/, "[data-service-card]");
      await sleep(700);
      console.log("механики:", await text("[data-mechanic-chips]"));
      await page.evaluate(() => document.querySelector("[data-mechanic-chips]")?.scrollIntoView({ block: "center" }));
      await sleep(400);
      await S("repair-edit-mech");
      await click(/ТЕСТ Механик shotbot/, "[data-mechanic-chips]");
      await sleep(300);
      await click(/^Сохранить$/, "[data-client-edit]");
      await sleep(1500);
      await page.evaluate(() => document.querySelector("[data-profit-block]")?.scrollIntoView({ block: "center" }));
      await sleep(500);
      console.log("деньги:", (await text("[data-profit-block]"))?.replace(/\n+/g, " | "));
      await S("repair-mech");
      // Снова готов к выдаче
      console.log("готов:", await click(/Готов к выдаче/, "[data-service-card] footer"));
      await sleep(1500);
      console.log("замок снова:", await page.evaluate(() => !!document.querySelector("[data-ready-lock]")));
      await click(/^Закрыть$|^Сохранить/, "[data-service-card]");
      await page.evaluate(() => document.querySelector('[aria-label="Закрыть"]')?.click());
      await sleep(800);
      // Механики
      console.log("кнопка «Механики»:", await click(/^Механики$/));
      await sleep(1000);
      console.log("список механиков:", (await text("[data-mechanics-sheet]"))?.replace(/\n+/g, " | ").slice(0, 200));
      await S("mechanics");
      await page.evaluate(() => [...document.querySelectorAll('[aria-label="Закрыть"]')].pop()?.click());
      await sleep(800);
      // Разбивка денег
      await page.evaluate(() => document.querySelector('[data-kpi="Прибыль"]')?.click());
      await sleep(1200);
      console.log("разбивка:", (await text("[data-money-summary]"))?.replace(/\n+/g, " | "));
      console.log("строк:", await page.evaluate(() => document.querySelectorAll("[data-money-row]").length));
      await S("repairs-money");
      await page.evaluate(() => [...document.querySelectorAll('[aria-label="Закрыть"]')].pop()?.click());
      await sleep(600);
    }
  }
}
