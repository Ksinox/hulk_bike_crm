/** Паритет 20.09: должники, документы и справочники с телефона/планшета. PHASE=phone|tablet */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "phone";
  const sfx = phase === "tablet" ? "-t" : "-m";
  const S = (n) => ctx.shot(`v204-${n}${sfx}-now`, { jpeg: true });
  await page.setUserAgent(phase === "tablet" ? IPAD_UA : PHONE_UA);
  await page.setViewport(
    phase === "tablet"
      ? { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
      : { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  );
  const click = (src, sel = "button, [role=button], a") =>
    page.evaluate((src, sel) => {
      const rx = new RegExp(src);
      const el = [...document.querySelectorAll(sel)]
        .filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && rx.test((x.textContent || "").trim()); })
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      el?.click();
      return el ? (el.textContent || "").trim().slice(0, 40) : null;
    }, src.source, sel);
  const overflow = () =>
    page.evaluate(() => {
      const bad = [];
      document.querySelectorAll("*").forEach((el) => {
        if (el.scrollWidth - el.clientWidth > 8 && el.clientWidth > 0 && getComputedStyle(el).overflowX === "visible") {
          bad.push(`${el.tagName}.${(el.className || "").toString().slice(0, 40)} ${el.scrollWidth}>${el.clientWidth}`);
        }
      });
      return { page: document.documentElement.scrollWidth > window.innerWidth + 2, bad: bad.slice(0, 3) };
    });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Посмотрю позже|^Позже$/.test(x.textContent || ""));
    b?.click();
  });
  await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}" });

  // Должники
  await ctx.gotoRoute("debtors");
  await ctx.sleep(2500);
  console.log("должники:", JSON.stringify(await overflow()), "| текст", await page.evaluate(() => document.body.innerText.length));
  await S("debtors");
  const opened = await click(/Открыть и разобраться/);
  console.log("дело:", opened);
  await ctx.sleep(2000);
  const caseInfo = await page.evaluate(() => ({
    заметка: [...document.querySelectorAll("button, textarea, input")].some((x) => /заметк/i.test((x.textContent || "") + (x.placeholder || ""))),
    звонок: [...document.querySelectorAll("button")].some((b) => /звонок|позвонил/i.test(b.textContent || "")),
    этап: [...document.querySelectorAll("button")].some((b) => /этап|Следующий шаг|Перевести/i.test(b.textContent || "")),
    платёж: [...document.querySelectorAll("button")].some((b) => /платёж|оплат/i.test(b.textContent || "")),
    заголовок: document.body.innerText.match(/Дело[^\n]{0,40}/)?.[0] ?? null,
  }));
  console.log("в деле:", JSON.stringify(await overflow()), "|", JSON.stringify(caseInfo));
  await S("debtor-case");

  // Документы
  await ctx.gotoRoute("docs");
  await ctx.sleep(2500);
  console.log("документы:", JSON.stringify(await overflow()));
  await S("docs");
  console.log("прейскурант:", await click(/Прейскурант/));
  await ctx.sleep(2000);
  console.log("прайс:", JSON.stringify(await overflow()), "| кнопки правки:", await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => /Добавить|Изменить|\+/.test(b.textContent || "")).length));
  await S("price");

  // Справочники в «Скутерах»
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2000);
  console.log("модели:", await click(/^Модели$/));
  await ctx.sleep(1800);
  console.log("каталог моделей:", JSON.stringify(await overflow()), "| правка:", await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => /Добавить модель|Изменить/.test(b.textContent || ""))));
  await S("models");
  await page.keyboard.press("Escape");
  await ctx.sleep(800);
  console.log("экипировка:", await click(/^Экипировка$/));
  await ctx.sleep(1500);
  await S("equipment");
  await page.keyboard.press("Escape");
  await ctx.sleep(800);
  console.log("архив:", await click(/^Архив$/));
  await ctx.sleep(1500);
  await S("archive");
}
