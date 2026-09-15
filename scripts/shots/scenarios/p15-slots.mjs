/**
 * Пункт 15: арендные места. Плашка «X из N», рост общего количества,
 * карточка скутера (Место №, ID по раме), смена места, поиск по ID (п.18).
 */
import { API } from "./p9-common.mjs";

export async function run(page, ctx) {
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2200);
  const badge = await page.evaluate(() =>
    (document.body.innerText.match(/Арендных мест:[\s\S]{0,20}/) || [""])[0]
      .replace(/\n+/g, " "),
  );
  console.log("badge:", badge);
  await ctx.shot("p15-1-fleet", { jpeg: true });

  // 1) Увеличиваем общее количество мест до 10
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /^\d+ из \d+$/.test((x.textContent || "").trim()),
    );
    b?.click();
  });
  await ctx.sleep(500);
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find(
      (i) => i.value && /^\d+$/.test(i.value) && i.className.includes("w-14"),
    );
    if (!inp) return;
    const s = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    s.call(inp, "10");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ctx.sleep(300);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "ОК",
    );
    b?.click();
  });
  await ctx.sleep(1500);
  const badge2 = await page.evaluate(() =>
    (document.body.innerText.match(/Арендных мест:[\s\S]{0,20}/) || [""])[0]
      .replace(/\n+/g, " "),
  );
  console.log("badge after:", badge2);

  // 2) Поиск по ID (4 цифры рамы) — пункт 18
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) =>
      /Имя, VIN/.test(i.placeholder || ""),
    );
    if (!inp) return;
    const s = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    s.call(inp, "9672");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ctx.sleep(1200);
  const found = await page.evaluate(() => ({
    hasJog05: document.body.innerText.includes("Jog #05"),
    hasJog01: document.body.innerText.includes("Jog #01"),
  }));
  console.log("search by uid 9672:", JSON.stringify(found));
  await ctx.shot("p18-1-search-uid", { jpeg: true });

  // 3) Карточка Jog #03: бейджи место/ID + смена места
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) =>
      /Имя, VIN/.test(i.placeholder || ""),
    );
    const s = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    s.call(inp, "");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ctx.sleep(800);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")]
      .filter(
        (e) => (e.textContent || "").trim() === "Jog #03" && !e.children.length,
      )
      .pop();
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await ctx.sleep(1800);
  const card = await page.evaluate(() => ({
    slot: (document.body.innerText.match(/Место №\d+/) || [""])[0],
    uid: (document.body.innerText.match(/ID \d{4}/) || [""])[0],
  }));
  console.log("card:", JSON.stringify(card));
  await ctx.shot("p15-2-card", { jpeg: true });

  // смена места: №5 → №9 (свободное после расширения)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /^№\d+$/.test((x.textContent || "").trim()),
    );
    b?.click();
  });
  await ctx.sleep(800);
  await ctx.shot("p15-3-slot-menu", { jpeg: true });
  await page.evaluate(() => {
    // в меню свободных мест — кнопка «9»
    const menu = [...document.querySelectorAll("div")].find((d) =>
      /Свободные места/.test(d.textContent || ""),
    );
    const b = [...(menu?.querySelectorAll("button") ?? [])].find(
      (x) => (x.textContent || "").trim() === "9",
    );
    b?.click();
  });
  await ctx.sleep(2000);
  const after = await page.evaluate(() => ({
    slot: (document.body.innerText.match(/Место №\d+/) || [""])[0],
  }));
  console.log("after change:", JSON.stringify(after));
  await ctx.shot("p15-4-slot-changed", { jpeg: true });

  // контроль по API
  const apiCheck = await page.evaluate(async (api) => {
    const r = await fetch(api + "/api/scooters/slots", {
      credentials: "include",
    }).then((x) => x.json());
    return r;
  }, API(ctx.base));
  console.log("slots api:", JSON.stringify(apiCheck));
}
