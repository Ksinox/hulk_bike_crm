/**
 * Пункты 16-17: перевод Jog #03 из аренды в продажу.
 * Ожидаем: окно ключа директора (п.17), после подтверждения — место №9
 * освобождается, ярлык «Был в аренде · место №9» (п.16), парк аренды -1.
 */
import { API } from "./p9-common.mjs";

export async function run(page, ctx) {
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")]
      .filter(
        (e) => (e.textContent || "").trim() === "Jog #03" && !e.children.length,
      )
      .pop();
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await ctx.sleep(1800);
  // «Изменить статус»
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Изменить статус/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(1200);
  const modal = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .map((b) => (b.textContent || "").trim())
      .filter((t) => t && t.length < 40)
      .slice(-14),
  );
  console.log("status modal buttons:", JSON.stringify(modal));
  // выбрать опцию «На продажу» (строка модалки статуса)
  const picked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      (x.textContent || "").trim().startsWith("На продажу"),
    );
    if (!b) return false;
    b.click();
    return true;
  });
  console.log("option picked:", picked);
  await ctx.sleep(800);
  // применить
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Сохранить статус",
    );
    b?.click();
  });
  await ctx.sleep(1500);
  const gate = await page.evaluate(() =>
    /ключ директора/i.test(document.body.innerText),
  );
  console.log("director gate:", gate);
  await ctx.shot("p17-1-gate", { jpeg: true });
  if (gate) {
    await page.evaluate(() => {
      const inp = [...document.querySelectorAll('input[type="password"]')].find(
        (i) => i.placeholder === "Ключ директора",
      );
      const s = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      s.call(inp, "2626");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await ctx.sleep(300);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => (x.textContent || "").trim() === "Подтвердить",
      );
      b?.click();
    });
    await ctx.sleep(3500);
  }
  // карточка после: ярлык «Был в аренде»
  const after = await page.evaluate(() => ({
    exBadge: (document.body.innerText.match(/Был в аренде[^\n]{0,25}/) || [""])[0],
    status: (document.body.innerText.match(/На продаж[а-я]*/) || [""])[0],
  }));
  console.log("after:", JSON.stringify(after));
  await ctx.shot("p16-1-ex-badge", { jpeg: true });

  const slots = await page.evaluate(async (api) => {
    const r = await fetch(api + "/api/scooters/slots", {
      credentials: "include",
    }).then((x) => x.json());
    const sc = await fetch(api + "/api/scooters", { credentials: "include" })
      .then((x) => x.json());
    const j3 = (sc.items ?? sc).find((s) => s.name === "Jog #03");
    return {
      free: r.free,
      j3: { slot: j3?.rentalSlot, ex: j3?.exRentalSlot, status: j3?.baseStatus },
    };
  }, API(ctx.base));
  console.log("api:", JSON.stringify(slots));
}
