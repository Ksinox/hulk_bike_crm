/**
 * Пункт 9 — «БЫЛО» (гонять на СТАРОМ коде API, до фикса).
 * Кейс: просрочка 10 дн @600 → долг 9 000 (дни 6 000 + штраф 3 000).
 * Клиент вносит 1 830 → диалог обещает «останется 7 170», но по факту
 * долг падает до 6 300 — штраф за выкупленные дни исчезает.
 */
import {
  ensureCase,
  openPaymentWith1830,
  acceptPayment,
  clipOf,
} from "./p9-common.mjs";

export async function run(page, ctx) {
  const id = await ensureCase(page, ctx);
  if (!id) throw new Error("кейс не создан");
  console.log("rental:", id);

  // 1. Карточка с долгом 9 000 / 10 дн
  await ctx.gotoRoute("rentals", { rentalId: id });
  await ctx.sleep(800);
  await ctx.shot("p9-before-1-card9000");

  // 2. Диалог: внесено 1830, обещание «останется 7 170»
  await openPaymentWith1830(page, ctx, id);
  await ctx.shot("p9-before-2-dialog");
  // Кроп: блок «Клиент вносит по долгу … останется долгом …»
  const clip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("*")].find(
        (e) =>
          /останется долгом/.test(e.textContent || "") &&
          (e.textContent || "").length < 400 &&
          e.querySelectorAll("input").length >= 0 &&
          e.getBoundingClientRect().height < 260 &&
          e.getBoundingClientRect().height > 60,
      );
      return el ?? document.body;
    },
    14,
  );
  if (clip) await ctx.shot("p9-before-2-promise-crop", { clip });

  // 3. Принять → карточка: долг стал 6 300 (а обещали 7 170) — БАГ
  await acceptPayment(page, ctx);
  await ctx.gotoRoute("rentals", { rentalId: id });
  await ctx.sleep(900);
  await ctx.shot("p9-before-3-card-after");
  const clip2 = await clipOf(
    page,
    () => {
      // KPI-плашка «Долг» в карточке (правая панель)
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
  if (clip2) await ctx.shot("p9-before-3-debt-crop", { clip: clip2 });
}
