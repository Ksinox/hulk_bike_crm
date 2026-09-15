/** Проверка правок: партнёрка, карточка скутера, анкета, аренды. */
import { API, clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  // 1) Партнёрка: общий процент + таблица
  await ctx.gotoRoute("partners");
  await ctx.sleep(2500);
  const partners = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      common: /Процент инвестора по умолчанию/.test(t),
      value: (t.match(/Процент инвестора по умолчанию\s*\n?\s*(\d+)\s*%/) || [])[1],
      rows: (t.match(/Dio[^\n]*/g) || []).slice(0, 2),
    };
  });
  console.log("partners:", JSON.stringify(partners));
  await ctx.shot("fb-partners", { jpeg: true });

  // 2) Карточка скутера: имя+номер, ID, партнёрство
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    const leaf = [...document.querySelectorAll("*")]
      .filter((e) => /Dio/.test((e.textContent || "").trim()) && !e.children.length)
      .pop();
    leaf?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await ctx.sleep(2000);
  const card = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      hasHash: /#\d\d/.test(t.slice(0, 400)),
      uid: (t.match(/ID\s*(\d+)/) || [])[1],
      partner: /Партнёрская/.test(t),
      numberLabel: /НОМЕР В АРЕНДЕ/i.test(t),
      belongs: (t.match(/ПРИНАДЛЕЖНОСТЬ[\s\S]{0,60}/i) || [""])[0].replace(/\n+/g, " · "),
    };
  });
  console.log("scooter card:", JSON.stringify(card));
  const clip = await clipOf(
    page,
    () => {
      const h = document.querySelector("h1");
      return h?.parentElement ?? document.body;
    },
    16,
  );
  if (clip) await ctx.shot("fb-scooter-head", { clip });
  await ctx.shot("fb-scooter-card", { jpeg: true });

  // 3) Список аренд: электро-иконка + номер в кружке
  await ctx.gotoRoute("rentals");
  await ctx.sleep(2000);
  const rentals = await page.evaluate(() => {
    const row = [...document.querySelectorAll("tr")].find((r) =>
      /Dio/.test(r.textContent || ""),
    );
    return { text: (row?.textContent || "").replace(/\s+/g, " ").slice(0, 90) };
  });
  console.log("rentals row:", JSON.stringify(rentals));
  await ctx.shot("fb-rentals", { jpeg: true });

  // 4) Анкета: плашки бензин/электро
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem(
      "hulk-application-draft",
      JSON.stringify({
        applicationId: null, uploadToken: null, expiresAt: null,
        fields: {}, step: 4, uploadedKinds: [],
        savedAt: new Date().toISOString(),
      }),
    );
  });
  await page.goto("about:blank");
  await page.goto(ctx.base + "/#/apply", { waitUntil: "networkidle2" });
  await ctx.sleep(3500);
  const apply = await page.evaluate(() => ({
    petrol: /Бензиновый/.test(document.body.innerText),
    electric: /Электро/.test(document.body.innerText),
    emoji: /⚡/.test(document.body.innerText),
  }));
  console.log("apply:", JSON.stringify(apply));
  await ctx.shot("fb-apply", { jpeg: true });
}
