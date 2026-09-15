/**
 * Пункт 9 — «СТАЛО» (гонять на НОВОМ коде API, после фикса).
 * Предполагает, что p9-before уже прогнан (аренда с оплатой 1 830 есть):
 * сначала откатывает багованную оплату (долг возвращается к 9 000/10 дн),
 * затем повторяет тот же сценарий — теперь долг после оплаты 7 170,
 * ровно как обещал диалог; в истории видна запись «Штраф сохранён».
 */
import {
  openPaymentWith1830,
  acceptPayment,
  clipOf,
  API,
} from "./p9-common.mjs";

export async function run(page, ctx) {
  // найти аренду клиента 5 + откатить последний rent-платёж «Оплата N дн просрочки»
  const id = await page.evaluate(async (api) => {
    const g = (u, o) =>
      fetch(api + u, { credentials: "include", ...(o || {}) }).then((r) =>
        r.json().catch(() => null),
      );
    const rn = await g("/api/rentals");
    const mine = (rn.items ?? rn ?? []).find(
      (r) => r.clientId === 5 && r.status === "active",
    );
    if (!mine) return null;
    const d = await g(`/api/rentals/${mine.id}/debt`);
    const pay = (d.payments ?? []).find(
      (p) => p.type === "rent" && /дн просрочки/.test(p.note || ""),
    );
    if (pay) {
      await g(`/api/rentals/${mine.id}/rollback-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: pay.id }),
      });
    }
    return mine.id;
  }, API(ctx.base));
  if (!id) throw new Error("аренда клиента 5 не найдена — прогоните p9-before");
  console.log("rental:", id);
  await ctx.sleep(600);

  // 1. Тот же диалог: 1830 → «останется 7 170»
  await openPaymentWith1830(page, ctx, id);
  await ctx.shot("p9-after-1-dialog");

  // 2. Принять → карточка: долг РОВНО 7 170 — как обещано
  await acceptPayment(page, ctx);
  await ctx.gotoRoute("rentals", { rentalId: id });
  await ctx.sleep(900);
  await ctx.shot("p9-after-2-card");
  const clip2 = await clipOf(
    page,
    () => {
      const label = [...document.querySelectorAll("*")].find(
        (d) =>
          (d.textContent || "").trim() === "ДОЛГ" ||
          ((d.textContent || "").trim() === "Долг" &&
            (d.className || "").includes("uppercase")),
      );
      let card = label;
      for (let i = 0; i < 6 && card; i++) {
        if ((card.className || "").includes("rounded")) break;
        card = card.parentElement;
      }
      return card ?? document.body;
    },
    12,
  );
  if (clip2) await ctx.shot("p9-after-2-debt-crop", { clip: clip2 });

  // 3. История долгов: запись «Штраф сохранён (дни оплачены)»
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Финансовая информация/.test(x.textContent || ""),
    );
    b?.click();
    return !!b;
  });
  await ctx.sleep(900);
  if (opened) {
    const clip3 = await clipOf(
      page,
      () => {
        const el = [...document.querySelectorAll("*")].find(
          (e) =>
            /Штраф сохранён/.test(e.textContent || "") &&
            (e.textContent || "").length < 300,
        );
        return el ?? document.body;
      },
      14,
    );
    if (clip3) await ctx.shot("p9-after-3-history-crop", { clip: clip3 });
  }
}
