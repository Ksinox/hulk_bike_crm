/**
 * Сверка мастера оплаты: компьютер ↔ телефон ↔ планшет.
 * Собирает все управляющие элементы окна и пишет их списком, чтобы видеть,
 * не потерялась ли на телефоне какая-то возможность компьютерной версии.
 *   PHASE=desk|phone|tablet CLIENT="Имя" node scripts/shots/shot.mjs scripts/shots/scenarios/chk-204-pay-parity.mjs
 * Ничего не подтверждает — окно открывается и закрывается без записи.
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function run(page, ctx) {
  const phase = process.env.PHASE ?? "desk";
  const client = process.env.CLIENT ?? "Алексей Смирнов";
  if (phase === "phone") await page.setUserAgent(PHONE_UA);
  if (phase === "tablet") await page.setUserAgent(IPAD_UA);
  await page.setViewport(
    phase === "phone"
      ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : phase === "tablet"
        ? { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
        : { width: 1440, height: 900, deviceScaleFactor: 1 },
  );
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Посмотрю позже|^Позже$/.test(b.textContent || ""))?.click();
  });
  await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}" });

  const click = (rx, sel = "button, [role=switch], [role=button]") =>
    page.evaluate(
      (src, sel) => {
        const r = new RegExp(src);
        const el = [...document.querySelectorAll(sel)]
          .filter((x) => {
            const b = x.getBoundingClientRect();
            return b.width > 0 && b.height > 0 && r.test((x.textContent || "").trim());
          })
          .sort((a, b) => a.textContent.length - b.textContent.length)[0];
        el?.click();
        return el ? (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) : null;
      },
      rx.source,
      sel,
    );

  /** Всё, чем можно управлять в открытом окне: кнопки, тумблеры, поля. */
  const controls = () =>
    page.evaluate(() => {
      // окно оплаты: самый компактный блок, где есть заголовок и высота листа
      const cands = [...document.querySelectorAll("div")].filter((d) => {
        const r = d.getBoundingClientRect();
        return /Принять платёж/.test(d.innerText || "") && r.height > 380 && r.width > 280;
      });
      const dlg = cands.sort((a, b) => (a.innerText || "").length - (b.innerText || "").length)[0] ?? document.body;
      const seen = new Set();
      const out = [];
      dlg.querySelectorAll("button, [role=switch], [role=button], input, textarea, select").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const t =
          (el.textContent || "").trim().replace(/\s+/g, " ") ||
          el.getAttribute("placeholder") ||
          el.getAttribute("aria-label") ||
          el.getAttribute("title") ||
          `<${el.tagName.toLowerCase()}${el.type ? " " + el.type : ""}>`;
        const key = t.slice(0, 44);
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push(key);
      });
      return out;
    });

  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 200));

  await ctx.gotoRoute("rentals");
  await ctx.sleep(2000);
  console.log("аренда:", await click(new RegExp("^" + client), "div, li, button, tr, a"));
  await ctx.sleep(2500);
  console.log("оплата:", await click(/^Принять оплату$/));
  await ctx.sleep(2200);
  // при просрочке сначала спрашивают дату поступления денег
  const dateWin = await click(/^Продолжить$/);
  if (dateWin) {
    console.log("окно даты оплаты: подтвердили");
    await ctx.sleep(1800);
  }

  /** Текст окна оплаты целиком — по нему сверяем возможности. */
  const paneText = () =>
    page.evaluate(() => {
      const cands = [...document.querySelectorAll("div")].filter((d) => {
        const r = d.getBoundingClientRect();
        return /Принять платёж/.test(d.innerText || "") && r.height > 380 && r.width > 280;
      });
      const dlg = cands.sort((a, b) => (a.innerText || "").length - (b.innerText || "").length)[0];
      return (dlg?.innerText || "").replace(/\s+/g, " ");
    });

  if (phase === "desk") {
    console.log("ТЕКСТ ОКНА (компьютер):");
    console.log((await paneText()).slice(0, 2500));
    const all = await controls();
    console.log(`элементов: ${all.length}`);
    all.forEach((x) => console.log("  •", x));
    return;
  }

  // телефон/планшет — мастер по шагам, с текстом каждого шага
  for (let i = 1; i <= 6; i++) {
    const head = await page.evaluate(
      () => document.body.innerText.match(/ШАГ \d[^\n]*/i)?.[0] ?? document.body.innerText.slice(0, 40),
    );
    console.log(`--- ${head}`);
    console.log((await paneText()).slice(0, 1500));
    const moved = await click(/^Далее$/);
    if (!moved) break;
    await ctx.sleep(1100);
  }
}
