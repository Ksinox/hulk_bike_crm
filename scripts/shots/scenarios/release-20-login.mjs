/**
 * Кадр входа для карточки «Свой логин» (презентация 2.0): плитки как в
 * проде — «Директор» и «Никита». На превью есть тестовый аккаунт, поэтому
 * список плиток подменяется в ответе /api/auth/tiles.
 */
import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve("apps/web/public/release/2.0");
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function run(page, ctx) {
  const api = ctx.base.replace("crm-", "api-");
  const cookies = await page.cookies(api);
  await page.deleteCookie(...cookies);
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (req.url().includes("/api/auth/tiles") && req.method() === "GET") {
      req.respond({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": ctx.base, "Access-Control-Allow-Credentials": "true" },
        body: JSON.stringify({
          items: [
            { id: 2, name: "Директор", login: "director", role: "director", avatarColor: "blue", position: null },
            { id: 3, name: "Никита", login: "admin", role: "admin", avatarColor: "green", position: null },
          ],
        }),
      });
    } else req.continue();
  });
  for (const vp of [
    { name: "d-login", v: { width: 1280, height: 800, deviceScaleFactor: 1.5 } },
    { name: "m-login", v: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, ua: PHONE_UA },
  ]) {
    if (vp.ua) await page.setUserAgent(vp.ua);
    await page.setViewport(vp.v);
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(4500);
    await page.screenshot({ path: path.join(DIR, `${vp.name}.jpg`), type: "jpeg", quality: 80 });
    console.log("кадр", vp.name);
  }
  await page.setCookie(...cookies);
}
