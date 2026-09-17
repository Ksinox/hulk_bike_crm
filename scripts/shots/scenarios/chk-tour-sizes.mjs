/**
 * Показ обновления в реальных размерах (16.09, заказчик: «кадр сдвинут
 * вбок, весь блок не видно»). Прогресс shotbot сбрасывают перед запуском —
 * показ идёт с титула 2.0 и сплошняком в 2.0.1.
 * VP=d1440|d1366|d1920|t820|t1180|p390|p360. Кадры — scripts/shots/out/tour-<VP>-NN-(was|now).jpg
 */
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

const VPS = {
  d1440: { width: 1440, height: 900 },
  d1366: { width: 1366, height: 768 },
  d1920: { width: 1920, height: 1080 },
  t820: { width: 820, height: 1180, touch: true, ua: IPAD_UA },
  t1180: { width: 1180, height: 820, touch: true, ua: IPAD_UA },
  p390: { width: 390, height: 844, touch: true, ua: PHONE_UA },
  p360: { width: 360, height: 740, touch: true, ua: PHONE_UA },
};

export async function run(page, ctx) {
  const key = process.env.VP ?? "d1440";
  const vp = VPS[key];
  const both = process.env.BOTH === "1";
  if (vp.ua) await page.setUserAgent(vp.ua);
  await page.setViewport({
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: 1,
    isMobile: !!vp.touch,
    hasTouch: !!vp.touch,
  });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(6500);
  const state = () =>
    page.evaluate(() => ({
      title: document.querySelector(".rt-title")?.textContent ?? null,
      brand: document.querySelector(".rt-brand")?.textContent?.trim() ?? null,
      card: document.querySelector(".rt-card-title")?.textContent ?? null,
      count: document.querySelector(".rt-count")?.textContent ?? null,
      next: [...document.querySelectorAll(".rt-next")].map((b) => b.textContent.trim()).pop() ?? null,
      ba: !!document.querySelector(".rt-media .rt-ba"),
      media: (() => {
        const r = document.querySelector(".rt-media")?.getBoundingClientRect();
        return r ? `${Math.round(r.width)}×${Math.round(r.height)}` : null;
      })(),
      meta: document.querySelector(".rt-meta")?.textContent ?? null,
    }));
  const setPos = (v) =>
    page.evaluate((v) => {
      const input = document.querySelector('.rt-media .rt-ba input[type="range"]');
      if (!input) return false;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(input, String(v));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }, v);
  const clickText = (re) =>
    page.evaluate((src) => {
      const rx = new RegExp(src);
      const b = [...document.querySelectorAll("button")].find((x) => rx.test((x.textContent || "").trim()));
      b?.click();
      return b ? b.textContent.trim() : null;
    }, re.source);

  const s0 = await state();
  console.log(`[${key}] вход:`, JSON.stringify(s0));
  if (s0.title) {
    await ctx.shot(`tour-${key}-00-intro`, { jpeg: true });
    await clickText(/^Смотреть, что нового$/);
    await ctx.sleep(1500);
  }
  for (let n = 1; n <= 24; n++) {
    const st = await state();
    if (!st.card) {
      console.log(`[${key}] конец:`, JSON.stringify(st));
      break;
    }
    console.log(`[${key}] ${String(n).padStart(2, "0")} ${st.brand} · ${st.card} · ${st.count} · кнопка «${st.next}» · медиа ${st.media}`);
    const nn = String(n).padStart(2, "0");
    if (st.ba) {
      await setPos(0);
      await ctx.sleep(250);
      await ctx.shot(`tour-${key}-${nn}-now`, { jpeg: true });
      if (both) {
        await setPos(100);
        await ctx.sleep(250);
        await ctx.shot(`tour-${key}-${nn}-was`, { jpeg: true });
      }
    } else {
      await ctx.shot(`tour-${key}-${nn}-now`, { jpeg: true });
    }
    // «Крупно» — на карточке «Партия за один раз»
    if (new RegExp(process.env.ZOOM_CARD ?? "Партия за один раз").test(st.card) && process.env.ZOOM === "1") {
      await clickText(/Крупно$/);
      await ctx.sleep(800);
      await ctx.shot(`tour-${key}-${nn}-zoom`, { jpeg: true });
      await page.keyboard.press("Escape");
      await ctx.sleep(500);
      const after = await state();
      console.log(`[${key}]    «Крупно»: закрылось Esc, карточка на месте: ${after.card === st.card}`);
    }
    await clickText(/^(Дальше|Готово)/);
    await ctx.sleep(1200);
  }
}
