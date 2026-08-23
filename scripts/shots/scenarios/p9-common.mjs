/** Общее для сценариев пункта 9: подготовка кейса и шаги диалога оплаты. */

export const API = (base) => base.replace("crm-", "api-");

/** Готовит кейс: аренда клиента 5 (Алексей Смирнов) на скутере 4,
 *  выдана 27 дн назад на 17 дн → просрочка ровно 10 дн @600 ₽/сут.
 *  Возвращает id аренды. Если такая просрочка уже есть — переиспользует. */
export async function ensureCase(page, ctx) {
  return await page.evaluate(async (api) => {
    const g = (u, o) =>
      fetch(api + u, { credentials: "include", ...(o || {}) }).then((r) =>
        r.json().catch(() => null),
      );
    // уже есть подходящая аренда? (клиент 5, активна, просрочка 10 дн)
    const rn = await g("/api/rentals");
    const mine = (rn.items ?? rn ?? []).find(
      (r) => r.clientId === 5 && r.status === "active",
    );
    if (mine) return mine.id;
    // скутер 4 → в пул
    await g("/api/scooters/4", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseStatus: "rental_pool" }),
    });
    const DAY = 86400000;
    const start = new Date(Date.now() - 27 * DAY);
    const end = new Date(Date.now() - 10 * DAY);
    const created = await g("/api/rentals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: 5,
        scooterId: 4,
        tariffPeriod: "short",
        rate: 600,
        deposit: 2000,
        startAt: start.toISOString(),
        endPlannedAt: end.toISOString(),
        days: 17,
        sum: 10200,
        paymentMethod: "cash",
      }),
    });
    return created?.id;
  }, API(ctx.base));
}

/** Открывает карточку аренды и диалог оплаты, вводит сумму 1830.
 *  Останавливается на экране с обещанием «останется долгом …». */
export async function openPaymentWith1830(page, ctx, rentalId) {
  await ctx.gotoRoute("rentals", { rentalId });
  await ctx.sleep(800);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Принять оплату/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(1400);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Продолжить/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(1400);
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find(
      (i) => i.value === "9000",
    );
    if (!inp) throw new Error("поле суммы 9000 не найдено");
    const s = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    s.call(inp, "1830");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ctx.sleep(900);
}

/** Жмёт Наличные → Принять, ждёт применения. */
export async function acceptPayment(page, ctx) {
  await page.evaluate(() => {
    const nal = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Наличные",
    );
    nal?.click();
  });
  await ctx.sleep(500);
  await page.evaluate(() => {
    const ok = [...document.querySelectorAll("button")].find((x) =>
      /Принять$/.test((x.textContent || "").trim()),
    );
    ok?.click();
  });
  await ctx.sleep(3000);
}

/** Кроп по элементу с отступом. */
export async function clipOf(page, selectorFn, pad = 16) {
  const handle = await page.evaluateHandle(selectorFn);
  const el = handle.asElement();
  if (!el) return null;
  const box = await el.boundingBox();
  if (!box) return null;
  return {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  };
}
