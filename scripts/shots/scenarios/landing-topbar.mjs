/** Шапка без заглушки настроек и экран входа после обновления (15.09). SHOT_TAG=was|now */
export async function run(page, ctx) {
  const tag = process.env.SHOT_TAG || "now";
  const dismiss = () => page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => /^Позже$/.test((b.textContent || "").trim()))?.click(); });
  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 2 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5500); await dismiss();
  await ctx.gotoRoute("dashboard"); await ctx.sleep(3000); await dismiss();
  await page.mouse.move(700, 600);
  await ctx.sleep(400);
  await ctx.shot(`topbar-${tag}`, { clip: { x: 760, y: 10, width: 840, height: 80 } });
  if (tag !== "now") return;

  // Экран входа сразу после выкладки: сервер отвечает на старый вход
  // «session_revoked / update» — подставляем ровно этот ответ.
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (req.url().includes("/api/auth/me")) {
      // Запрос идёт с куками на другой домен — браузер примет ответ только
      // с точным origin и разрешением на куки, как у настоящего API.
      const origin = req.headers()["origin"] || new URL(ctx.base).origin;
      req.respond({
        status: 401,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", Vary: "Origin" },
        body: JSON.stringify({ error: "session_revoked", reason: "update" }),
      });
    } else req.continue();
  });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(4500);
  const t = await page.evaluate(() => document.body.innerText);
  console.log("экран входа:", JSON.stringify({ вход: /Вход в систему/i.test(t), пояснение: /CRM обновилась/.test(t) }));
  await ctx.shot("login-now-update", { jpeg: true });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(4000);
  await ctx.shot("login-now-update-mobile", { jpeg: true });
}
