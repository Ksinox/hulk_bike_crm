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
  }
}
