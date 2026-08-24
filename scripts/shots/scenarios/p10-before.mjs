/**
 * Пункт 10, «БЫЛО»: публичная анкета предлагает ВСЕ модели каталога,
 * включая те, которых нет в арендном парке (Tank, Dio).
 * Запускать ДО деплоя API-фикса.
 */
export async function run(page, ctx) {
  // черновик анкеты сразу на шаг 4 («Что хотите арендовать»)
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem(
      "hulk-application-draft",
      JSON.stringify({
        applicationId: null,
        uploadToken: null,
        expiresAt: null,
        fields: {},
        step: 4,
        uploadedKinds: [],
        savedAt: new Date().toISOString(),
      }),
    );
  });
  // SPA уже загружена как CRM — hash-переход её не перезапустит.
  // Уходим на blank и грузим точку входа анкеты заново.
  await page.goto("about:blank");
  await page.goto(ctx.base + "/#/apply", { waitUntil: "networkidle2" });
  await ctx.sleep(3500);
  const models = await page.evaluate(() =>
    ["Jog", "Gear", "Tank", "Dio"].filter((n) =>
      document.body.innerText.includes(n),
    ),
  );
  console.log("models visible:", JSON.stringify(models));
  await ctx.shot("p10-before-1-all-models", { jpeg: true });
  // листаем к «Tank» (модели без техники) — клиент может её выбрать
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")]
      .filter(
        (e) => (e.textContent || "").trim() === "Tank" && !e.children.length,
      )
      .pop();
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await ctx.sleep(1500);
  const centered = await page.evaluate(() => {
    const m = document.body.innerText.match(/Tank[\s\S]{0,120}/);
    return m ? m[0].replace(/\n+/g, " · ").slice(0, 120) : null;
  });
  console.log("tank centered:", centered);
  await ctx.shot("p10-before-2-tank", { jpeg: true });
}
