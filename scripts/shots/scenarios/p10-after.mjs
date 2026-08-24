/**
 * Пункт 10, «СТАЛО»: анкета предлагает только модели с техникой
 * в арендном парке (Jog, Gear) — Tank и Dio исчезли.
 */
export async function run(page, ctx) {
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
  await page.goto("about:blank");
  await page.goto(ctx.base + "/#/apply", { waitUntil: "networkidle2" });
  await ctx.sleep(3500);
  const models = await page.evaluate(() => ({
    visible: ["Jog", "Gear", "Tank", "Dio"].filter((n) =>
      document.body.innerText.includes(n),
    ),
  }));
  console.log("models:", JSON.stringify(models));
  await ctx.shot("p10-after-1-only-fleet", { jpeg: true });
}
