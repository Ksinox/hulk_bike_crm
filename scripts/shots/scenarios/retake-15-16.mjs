/**
 * Пересъёмка п.15-16 после правок: ID = 6 цифр VIN, «номер» вместо «места»,
 * без плашки «Арендных мест», история аренд у техники, ушедшей на продажу.
 */
import { API, clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  const list = await page.evaluate(async (api) => {
    const r = await fetch(api + "/api/scooters", { credentials: "include" }).then(
      (x) => x.json(),
    );
    const items = r.items ?? r;
    return items.map((s) => ({
      id: s.id,
      name: s.name,
      uid: s.uid,
      slot: s.rentalSlot,
      ex: s.exRentalSlot,
      status: s.status,
    }));
  }, API(ctx.base));
  console.log("scooters:", JSON.stringify(list.slice(0, 14)));

  // 1) Страница «Скутеры» — общий план (плашки мест больше нет)
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2400);
  console.log(
    "плашка мест осталась?",
    await page.evaluate(() => /Арендных мест/.test(document.body.innerText)),
  );
  await ctx.shot("p15-1-fleet", { jpeg: true });

  // 2) Карточка скутера в аренде: номер + ID
  const inRent = list.find((s) => s.slot && s.status !== "sale");
  if (inRent) {
    await ctx.gotoRoute("fleet", { scooterId: inRent.id });
    await ctx.sleep(2200);
    const head = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        idBadge: (t.match(/ID\s*\d+/) || [""])[0],
        hasHash: /#\s?\d\d/.test(t),
        num: (t.match(/Номер в аренде[\s\S]{0,20}/) || [""])[0].replace(/\n+/g, " "),
      };
    });
    console.log("card head:", JSON.stringify(head));
    const headClip = await clipOf(
      page,
      () => {
        const el = [...document.querySelectorAll("div")]
          .filter(
            (d) =>
              /ID\s*\d{6}/.test(d.textContent || "") &&
              (d.textContent || "").length < 260,
          )
          .pop();
        return el ?? document.body;
      },
      12,
    );
    if (headClip) await ctx.shot("p15-2-header-crop", { clip: headClip });

    // выбор свободного номера
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        /^№\s*\d+$/.test((x.textContent || "").trim()),
      );
      b?.click();
    });
    await ctx.sleep(900);
    const menuOpen = await page.evaluate(() =>
      /свободн/i.test(document.body.innerText),
    );
    console.log("slot menu:", menuOpen);
    const menuClip = await clipOf(
      page,
      () => {
        const el = [...document.querySelectorAll("div")]
          .filter(
            (d) =>
              /свободн/i.test(d.textContent || "") &&
              (d.textContent || "").length < 400,
          )
          .pop();
        return el ?? document.body;
      },
      12,
    );
    if (menuClip) await ctx.shot("p15-3-menu-crop", { clip: menuClip });
    await page.keyboard.press("Escape");
    await ctx.sleep(500);
    await ctx.shot("p15-4-slot-changed", { jpeg: true });
  }

  // 3) Техника, ушедшая на продажу: ярлык + история аренд
  const sold = list.find((s) => s.ex);
  console.log("sold:", JSON.stringify(sold ?? null));
  if (sold) {
    await ctx.gotoRoute("fleet", { scooterId: sold.id });
    await ctx.sleep(2400);
    const hist = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        badge: /Был в аренде/.test(t),
        rentals: (t.match(/Был в аренде[\s\S]{0,220}/) || [""])[0]
          .replace(/\n+/g, " · ")
          .slice(0, 220),
      };
    });
    console.log("sold card:", JSON.stringify(hist));
    await ctx.shot("p16-1-ex-badge", { jpeg: true });
    const exClip = await clipOf(
      page,
      () => {
        const el = [...document.querySelectorAll("div")]
          .filter(
            (d) =>
              /Был в аренде/.test(d.textContent || "") &&
              (d.textContent || "").length < 500,
          )
          .pop();
        return el ?? document.body;
      },
      12,
    );
    if (exClip) await ctx.shot("p16-2-header-crop", { clip: exClip });
  }
}
