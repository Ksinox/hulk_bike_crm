/** Отладка: когда сбрасывается фильтр «С долгом». */
export async function run(page, ctx) {
  await ctx.gotoRoute("clients");
  await ctx.sleep(2500);
  const read = () =>
    page.evaluate(() => {
      const h1 = [...document.querySelectorAll("h1")].find(
        (e) => (e.textContent || "").trim() === "Клиенты",
      );
      const span = h1?.parentElement?.querySelector("span");
      const active = [...document.querySelectorAll("button")]
        .filter((b) =>
          ["Все", "Аренда", "Неактивные", "С долгом", "Проблемные"].includes(
            (b.textContent || "").trim(),
          ),
        )
        .map((b) => ({
          t: (b.textContent || "").trim(),
          cls: b.className.includes("bg-ink") || b.className.includes("bg-white"),
        }));
      return {
        counter: (span?.textContent || "").replace(/\s+/g, " ").trim(),
        buttons: active.map((a) => `${a.t}:${a.cls ? "ON" : "off"}`).join(" "),
      };
    });
  console.log("before:", JSON.stringify(await read()));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "С долгом",
    );
    b?.click();
  });
  for (const ms of [200, 600, 1500, 3000]) {
    await ctx.sleep(ms === 200 ? 200 : ms - 200);
    console.log(`+${ms}ms:`, JSON.stringify(await read()));
  }
}
