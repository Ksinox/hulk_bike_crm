/** Чистый кадр панели «Подтверждения» глазами директора (без гейта поверх). */
import { API, clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  // создаём висящий запрос от имени оператора
  const reqId = await page.evaluate(async (api) => {
    const r = await fetch(api + "/api/approvals", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "rental_delete",
        summary: "Удаление аренды #0037 — Павел Морозов",
        details: [
          "Причина: Создано случайно",
          "Скутер: Jog #05",
          "Сумма аренды: 3 500 ₽",
          "Аренда уйдёт в архив, история сохранится в журнале.",
        ],
      }),
    }).then((x) => x.json());
    return r?.id;
  }, API(ctx.base));
  console.log("request:", reqId);

  await ctx.gotoRoute("dashboard");
  await ctx.sleep(11000); // ApprovalsBell поллинг 15с → появление кнопки
  // шапка с кнопкой «Подтверждения (1)»
  const clipBell = await clipOf(
    page,
    () => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        /Подтверждения/.test(x.textContent || ""),
      );
      return b ? b.closest("header") ?? b.parentElement : document.body;
    },
    8,
  );
  if (clipBell) await ctx.shot("p1-3a-bell-crop", { clip: clipBell });

  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Подтверждения/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(1200);
  await ctx.shot("p1-3b-inbox");
  const clipCard = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")].find(
        (d) =>
          /Висящие подтверждения/.test(d.textContent || "") &&
          d.className.includes("max-w-lg"),
      );
      return el ?? document.body;
    },
    8,
  );
  if (clipCard) await ctx.shot("p1-3b-inbox-crop", { clip: clipCard });

  // чистим: отклоняем запрос ключом
  await page.evaluate(
    async (api, id) => {
      await fetch(api + `/api/approvals/${id}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "2626" }),
      });
    },
    API(ctx.base),
    reqId,
  );
  console.log("cleaned");
}
