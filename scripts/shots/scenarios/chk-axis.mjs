export async function run(page, ctx) {
  await ctx.gotoRoute("sales");
  await ctx.sleep(2600);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Сегодня")?.click();
  });
  await ctx.sleep(1600);
  const info = await page.evaluate(() => {
    const labels = [...document.querySelectorAll("span")]
      .map((s) => (s.textContent || "").trim())
      .filter((t) => /^\d{2}:00$/.test(t));
    return {
      first: labels[0] ?? null,
      last: labels[labels.length - 1] ?? null,
      now: `${String(new Date().getHours()).padStart(2, "0")}:00`,
    };
  });
  console.log("ось часов:", JSON.stringify(info));
  await ctx.shot("chk-axis-today", { jpeg: true });
}
