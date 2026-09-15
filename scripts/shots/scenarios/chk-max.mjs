/** Кнопка MAX: какой адрес открывается и что в буфере. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3400);
  await ctx.gotoRoute("clients");
  await ctx.sleep(2400);

  // Перехватываем window.open и буфер обмена
  await page.evaluate(() => {
    window.__opened = [];
    const orig = window.open;
    window.open = (url, name) => {
      window.__opened.push({ url: String(url), name: String(name) });
      return { focus() {} };
    };
    window.__origOpen = orig;
    window.__clip = null;
    if (navigator.clipboard) {
      navigator.clipboard.writeText = async (t) => {
        window.__clip = t;
      };
    }
    try { localStorage.removeItem("hulk-max-hint-shown"); } catch {}
  });

  // Сначала открываем клиента — кнопки живут в его карточке
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Алексей Смирнов/.test(b.textContent || ""))
      ?.click();
  });
  await ctx.sleep(1800);

  // Жмём кнопку MAX у телефона клиента
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => (b.getAttribute("title") || "").includes("MAX"),
    );
    if (!btn) return "нет кнопки";
    btn.click();
    return "ок";
  });
  await ctx.sleep(1200);

  console.log("клик:", clicked);
  console.log("результат:", await page.evaluate(() => ({
    opened: window.__opened,
    clipboard: window.__clip,
    toast: document.body.innerText.includes("MAX открыт"),
    hint: document.body.innerText.includes("Как настроить"),
  })));
  await ctx.shot("v6-max-toast", { jpeg: true });
}
