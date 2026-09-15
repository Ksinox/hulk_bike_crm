/** Пункт 3: виджет мессенджеров в открытой заявке. */
import { clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForFunction(() => document.body.innerText.length > 200, {
    timeout: 20000,
  });
  await ctx.gotoRoute("applications");
  await ctx.sleep(2000);
  const opened = await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find(
      (e) =>
        /Игорь Соловьёв/.test(e.textContent || "") &&
        (e.textContent || "").length < 200,
    );
    let btn = el;
    for (let i = 0; i < 6 && btn; i++) {
      if (btn.tagName === "BUTTON" || btn.getAttribute?.("role") === "button")
        break;
      btn = btn.parentElement;
    }
    (btn ?? el)?.click();
    return !!el;
  });
  await ctx.sleep(2000);
  const widget = await page.evaluate(
    () => !!document.querySelector('a[href^="https://wa.me/"]'),
  );
  console.log("opened:", opened, "widget:", widget);
  const clip = await clipOf(
    page,
    () => {
      const el = document.querySelector('a[href^="https://wa.me/"]');
      let box = el?.parentElement?.parentElement;
      return box ?? document.body;
    },
    18,
  );
  if (clip) await ctx.shot("p3-2-application-crop", { clip });
}
