/** Общее для пункта 2: KPI «Выручка» и подготовка одноразовой аренды. */
import { API, clipOf } from "./p9-common.mjs";

/** Создаёт одноразовую аренду (Павел Морозов, Jog #07) с автооплатой 3500. */
export async function createThrowaway(page, ctx) {
  return await page.evaluate(async (api) => {
    const j = (u, o) =>
      fetch(api + u, { credentials: "include", ...(o || {}) }).then((r) =>
        r.json().catch(() => null),
      );
    const v = await j("/api/approvals/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "2626", action: "scooter_status_change" }),
    });
    await fetch(api + "/api/scooters/5", {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-director-approval": v && v.pass ? "pass:" + v.pass : "",
      },
      body: JSON.stringify({ baseStatus: "rental_pool" }),
    });
    const DAY = 86400000;
    const created = await j("/api/rentals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: 6,
        scooterId: 5,
        tariffPeriod: "short",
        rate: 500,
        deposit: 2000,
        startAt: new Date().toISOString(),
        endPlannedAt: new Date(Date.now() + 7 * DAY).toISOString(),
        days: 7,
        sum: 3500,
        paymentMethod: "cash",
      }),
    });
    return created?.id;
  }, API(ctx.base));
}

/** Кроп KPI-плашки «Выручка» в шапке страницы «Аренды».
 *  Жёсткая перезагрузка перед кадром — иначе React-Query кэш показывает
 *  выручку без только что созданных API-мимо-UI платежей. */
export async function shotRevenueKpi(page, ctx, name) {
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForFunction(() => document.body.innerText.length > 200, {
    timeout: 20000,
  });
  await ctx.gotoRoute("rentals");
  await ctx.sleep(1800);
  const clip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("*")].find(
        (d) =>
          (d.textContent || "").trim() === "Выручка" &&
          (d.parentElement?.textContent || "").includes("₽"),
      );
      let card = el;
      for (let i = 0; i < 5 && card; i++) {
        if ((card.className || "").includes("rounded")) break;
        card = card.parentElement;
      }
      return card ?? document.body;
    },
    10,
  );
  if (clip) await ctx.shot(name, { clip });
}

/** Удаляет аренду через UI: меню ⋯ → Удалить → «Создано случайно» → ключ. */
export async function deleteViaUi(page, ctx, rentalId) {
  await ctx.gotoRoute("rentals", { rentalId });
  await ctx.sleep(1500);
  const ok = await page.evaluate(
    (no) => document.body.innerText.includes(no),
    `#${String(rentalId).padStart(4, "0")}`,
  );
  if (!ok) {
    await ctx.gotoRoute("rentals", { rentalId });
    await ctx.sleep(1500);
  }
  await page.evaluate(() => {
    const dots = [...document.querySelectorAll("button")].find(
      (b) =>
        b.querySelector("svg.lucide-ellipsis") ||
        b.querySelector("svg.lucide-more-horizontal"),
    );
    dots?.click();
  });
  await ctx.sleep(700);
  await page.evaluate(() => {
    const del = [...document.querySelectorAll("button,[role=menuitem]")].find(
      (b) =>
        /Удалить/.test(b.textContent || "") &&
        (b.textContent || "").length < 40,
    );
    del?.click();
  });
  await ctx.sleep(900);
  await page.evaluate(() => {
    const opt = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim() === "Создано случайно",
    );
    opt?.click();
  });
  await ctx.sleep(1500);
  // окно ключа (если защита включена) — вводим 2626
  const hasGate = await page.evaluate(
    () => !!document.querySelector('input[placeholder="Ключ директора"]'),
  );
  if (hasGate) {
    await page.evaluate(() => {
      const inp = document.querySelector('input[placeholder="Ключ директора"]');
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
  }
  await ctx.sleep(3500);
}

export { API, clipOf };
