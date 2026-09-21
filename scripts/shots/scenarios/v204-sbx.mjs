/**
 * Выпуск 2.0.4 — кадры, которые снимаются только в ПЕСОЧНИЦЕ (копия базы
 * превью без ключа директора, свободные электрички «U-5 ТЕСТ»):
 *   rent      — п.6: новая аренда, кнопки моделей (электрички в «Jog»)
 *   sensitive — п.8: «В продаже» → правка → «Цена закупа» под ключом
 *   SHOT_BASE=http://localhost:5174 SHOT_API=http://localhost:5174 PHASE=desk|phone WHEN=was|now ONLY=…
 */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const when = process.env.WHEN ?? "now";
  const only = (process.env.ONLY ?? "").split(",").filter(Boolean);
  const want = (s) => only.length === 0 || only.includes(s);
  const sfx = phase === "phone" ? "-m" : phase === "tablet" ? "-t" : "";
  const S = (n) => ctx.shot(`v204-${n}${sfx}-${when}`, { jpeg: true });
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
  if (phase === "phone") await page.setUserAgent(PHONE_UA);
  if (phase === "tablet") await page.setUserAgent(IPAD_UA);
  await page.setViewport(
    phase === "desk"
      ? { width: 1440, height: 900, deviceScaleFactor: 1 }
      : phase === "tablet"
        ? { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
        : { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  );
  // п.8: «ключ в этой вкладке уже вводили» — только локальная песочница,
  // шторка открывается без окна ключа (сам ключ не нужен и не трогается).
  if (want("sensitive")) await page.evaluateOnNewDocument(() => sessionStorage.setItem("hulk.sensitive.unlocked", "1"));
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await sleep(6000);
  await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}" });

  /* ---- п.6 ---- */
  if (want("rent")) {
    await ctx.gotoRoute("rentals");
    await sleep(1200);
    console.log("новая:", await click(/Новая сделка|^Новая$/));
    await sleep(800);
    console.log("напрокат:", await click(/Скутер напрокат/));
    await sleep(2000);
    const chips = await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .map((b) => (b.textContent || "").trim())
        .filter((t) => /\(\d+\)$/.test(t) || /^(Все|Бензин|Электро)/.test(t))
        .join(" | "),
    );
    console.log("кнопки:", chips);
    await S("rent-models");
    console.log("нажали:", await click(/^(Yamaha )?Jog \(\d+\)$|^Jog$/));
    await sleep(800);
    const list = await page.evaluate(
      () =>
        [...document.querySelectorAll("div")].find((d) => d.className.includes("max-h-[160px]"))?.innerText.replace(/\s+/g, " ") ??
        document.body.innerText.match(/U-5[^\n]*/g)?.join(" ; ") ??
        "",
    );
    console.log("в «Jog»:", list.slice(0, 300));
    await S("rent-jog");
    await page.keyboard.press("Escape");
    await sleep(600);
  }

  /* ---- п.6: из карточки клиента с заявкой на «Jog» ---- */
  if (want("client")) {
    await ctx.gotoRoute("clients");
    await sleep(1500);
    console.log("клиент:", await click(/Покупкин/, "body", "button, tr, li, div[role=button], a"));
    await sleep(2500);
    console.log("продолжить:", await click(/Продолжить оформление аренды/));
    await sleep(2500);
    const state = await page.evaluate(() => {
      const chips = [...document.querySelectorAll("button")]
        .map((b) => ({ t: (b.textContent || "").trim(), on: b.className.includes("bg-ink") }))
        .filter((c) => /\(\d+\)$/.test(c.t));
      const grid = [...document.querySelectorAll("div")].find((d) => d.className.includes("max-h-[160px]"));
      return {
        chips: chips.map((c) => `${c.on ? "[" : ""}${c.t}${c.on ? "]" : ""}`).join(" | "),
        grid: grid?.innerText.replace(/\s+/g, " ") ?? document.body.innerText.match(/U-5[^\n]*/g)?.join(" ; ") ?? "",
      };
    });
    console.log("кнопки моделей:", state.chips);
    console.log("свободные:", state.grid);
    await S("client-rent");
    await page.keyboard.press("Escape");
    await sleep(600);
  }

  /* ---- п.12: премия за план ---- */
  if (want("plan")) {
    await ctx.gotoRoute("analytics");
    await sleep(2500);
    console.log("раздел:", await click(/^Настройка стены$/));
    await sleep(2500);
    const opened = await page.evaluate(() => {
      const tile = document.querySelector('[data-flip-key="sales.count"]');
      const btn = [...(tile?.querySelectorAll("button") ?? [])].find((b) => b.title === "План");
      btn?.click();
      return !!btn;
    });
    console.log("окно плана:", opened);
    await sleep(700);
    await page.evaluate(() => {
      const el = document.querySelector('input[aria-label="Премия за выполнение плана"]');
      if (el) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(el, "5000");
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await sleep(400);
    await S("plan-bonus-form");
    console.log("ОК:", await click(/^ОК$/));
    await sleep(700);
    console.log("сохранить:", await click(/^Сохранить$/));
    await sleep(2000);
    console.log("плитка:", await page.evaluate(() => document.querySelector('[data-flip-key="sales.count"]')?.innerText.replace(/\n+/g, " | ")));
    console.log("сводка:", await page.evaluate(() => document.querySelector('[data-flip-key="plan.summary"]')?.innerText.replace(/\n+/g, " | ")));
    await S("plan-bonus");
  }

  /* ---- п.15: закуп по моделям в партии ---- */
  if (want("batch")) {
    await ctx.gotoRoute("fleet");
    await sleep(1500);
    console.log("вкладка:", await click(/^Партии/));
    await sleep(1800);
    const okb = await page.evaluate(() => {
      const card = [...document.querySelectorAll("section")].find((x) => /ТЕСТ электро-партия/.test(x.textContent || ""));
      card?.scrollIntoView({ block: "center" });
      card?.querySelector("[data-batch-edit-open]")?.click();
      return !!card;
    });
    console.log("партия открыта:", okb);
    await sleep(1800);
    await page.evaluate(() => document.querySelector("[data-batch-cost-models]")?.scrollIntoView({ block: "center" }));
    await sleep(400);
    console.log("закуп:", await page.evaluate(() => document.querySelector("[data-batch-cost-models]")?.innerText.replace(/\n+/g, " | ")));
    await S("batch-cost");
    await page.keyboard.press("Escape");
    await sleep(600);
  }

  /* ---- паритет: ремонт нашей техники с телефона ---- */
  if (want("job")) {
    await ctx.gotoRoute("service");
    await sleep(2500);
    console.log("наша техника:", await click(/^Наша техника/));
    await sleep(1500);
    const opened = await page.evaluate(() => {
      const row = [...document.querySelectorAll("button")].find((b) => /Чек-лист|готово/.test(b.textContent || ""));
      row?.click();
      return row ? (row.textContent || "").replace(/\s+/g, " ").slice(0, 60) : null;
    });
    console.log("ремонт:", opened);
    await sleep(1500);
    const info = await page.evaluate(() => {
      const el = document.querySelector("[data-mobile-job]");
      return {
        text: el?.innerText.replace(/\n+/g, " | ").slice(0, 220) ?? null,
        items: document.querySelectorAll("[data-progress]").length,
        finish: [...document.querySelectorAll("button")].some((b) => /Готов к аренде/.test(b.textContent || "")),
      };
    });
    console.log("карточка ремонта:", JSON.stringify(info));
    await S("job");
    if (when === "now" && info.items > 0) {
      await page.evaluate(() => document.querySelector("[data-progress] button")?.click());
      await sleep(1500);
      console.log("после отметки:", await page.evaluate(() => document.querySelector("[data-mobile-job]")?.innerText.match(/Чек-лист[^|]*/)?.[0] ?? document.querySelector("[data-mobile-job]")?.innerText.slice(0, 80)));
      await S("job-checked");
    }
  }

  /* ---- п.8 ---- */
  if (want("sensitive")) {
    await ctx.gotoRoute("sales");
    await sleep(1500);
    console.log("вкладка:", await click(/^В продаже/));
    await sleep(1500);
    // карандаш у первой единицы
    const opened = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.querySelector("svg.lucide-pencil") && x.getBoundingClientRect().width > 0);
      b?.click();
      return !!b;
    });
    console.log("правка открыта:", opened);
    await sleep(1000);
    // Открыть закуп (ключа в песочнице нет — откроется сразу)
    const masked = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[aria-label="Скрыто — доступно директору по ключу"]')].find((x) => x.closest(".fixed"));
      el?.click();
      return !!el;
    });
    console.log("нажали на скрытое:", masked);
    await sleep(1200);
    await S("sens-open");
    // Нажали в поле «Цена закупа»
    const input = await page.evaluateHandle(() => {
      const lbl = [...document.querySelectorAll("label, div")].find((x) => /^Цена закупа/.test((x.textContent || "").trim()) && x.querySelector("input"));
      return lbl?.querySelector("input") ?? null;
    });
    const el = input.asElement();
    if (el) {
      await el.click();
      await sleep(500);
      await page.keyboard.type("5");
      await sleep(600);
    }
    const after = await page.evaluate(() => ({
      stillHidden: !![...document.querySelectorAll('[aria-label="Скрыто — доступно директору по ключу"]')].find((x) => x.closest(".fixed")),
      value: [...document.querySelectorAll("input")].find((i) => i.closest(".fixed") && i.inputMode === "numeric" && i.value)?.value ?? null,
    }));
    console.log("после нажатия в поле:", JSON.stringify(after));
    await S("sens-click");
    await page.keyboard.press("Escape");
  }
}
