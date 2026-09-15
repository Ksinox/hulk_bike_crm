/**
 * Пункт 1 — «Ключ директора»: самопроверка UI + скриншоты для лендинга.
 *
 * История: настройка ключа → менеджер удаляет аренду → всплывает окно
 * с отчётом операции → «Отправить директору» → ожидание → директор видит
 * «Подтверждения» в шапке → вводит ключ → у менеджера операция выполняется.
 */
import { API, clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  // ── Подготовка: одноразовая аренда для удаления (Павел Морозов, скутер 5).
  const rentalId = await page.evaluate(async (api) => {
    const j = (u, o) =>
      fetch(api + u, { credentials: "include", ...(o || {}) }).then((r) =>
        r.json().catch(() => null),
      );
    // pass для смены статуса скутера (защита уже включена)
    const v = await j("/api/approvals/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "2626", action: "scooter_status_change" }),
    });
    await j("/api/scooters/5", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-director-approval": "pass:" + v.pass,
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
  if (!rentalId) throw new Error("тест-аренда не создана");
  console.log("rental:", rentalId);

  // ── Шаг 0: Настройки — секция «Ключ директора» (установлен).
  await ctx.gotoRoute("settings");
  await ctx.sleep(900);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("section")].find((s) =>
      /Ключ директора/.test(s.textContent || ""),
    );
    el?.scrollIntoView({ block: "center" });
  });
  await ctx.sleep(400);
  const clipKey = await clipOf(
    page,
    () =>
      [...document.querySelectorAll("section")].find((s) =>
        /Ключ директора/.test(s.textContent || ""),
      ) ?? document.body,
    10,
  );
  if (clipKey) await ctx.shot("p1-0-settings-crop", { clip: clipKey });

  // ── Шаг 1: карточка аренды → меню ⋯ → Удалить → причина.
  await ctx.gotoRoute("rentals", { rentalId });
  await ctx.sleep(1200);
  // кнопка ⋯ в шапке карточки
  await page.evaluate(() => {
    const dots = [...document.querySelectorAll("button")].find(
      (b) =>
        b.querySelector("svg.lucide-ellipsis") ||
        b.querySelector("svg.lucide-more-horizontal"),
    );
    dots?.click();
  });
  await ctx.sleep(700);
  const clickedDelete = await page.evaluate(() => {
    const del = [...document.querySelectorAll("button,[role=menuitem]")].find(
      (b) => /Удалить/.test(b.textContent || "") && (b.textContent || "").length < 40,
    );
    del?.click();
    return !!del;
  });
  console.log("menu delete:", clickedDelete);
  await ctx.sleep(900);
  // причина: «Создано случайно»
  await page.evaluate(() => {
    const opt = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim() === "Создано случайно",
    );
    opt?.click();
  });
  await ctx.sleep(1500);

  // ── Шаг 2: окно «Ключ директора» с отчётом операции.
  const gateShown = await page.evaluate(() =>
    document.body.innerText.includes("Ключ директора"),
  );
  console.log("gate:", gateShown);
  await ctx.shot("p1-1-gate");
  const clipGate = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")].find(
        (d) =>
          /Ключ директора/.test(d.textContent || "") &&
          /Отправить директору/.test(d.textContent || "") &&
          d.className.includes("max-w-md"),
      );
      return el ?? document.body;
    },
    8,
  );
  if (clipGate) await ctx.shot("p1-1-gate-crop", { clip: clipGate });

  // ── Шаг 3: «Отправить директору» → ожидание.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Отправить директору/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(1500);
  const clipWait = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")].find(
        (d) =>
          /Запрос отправлен директору/.test(d.textContent || "") &&
          d.className.includes("max-w-md"),
      );
      return el ?? document.body;
    },
    8,
  );
  if (clipWait) await ctx.shot("p1-2-waiting-crop", { clip: clipWait });

  // ── Шаг 4: «директор» открывает Подтверждения из шапки (та же вкладка —
  //    окно ожидания продолжает висеть под панелью).
  await ctx.sleep(9000); // даём ApprovalsBell подтянуть pending (поллинг)
  const bell = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Подтверждения/.test(x.textContent || ""),
    );
    b?.click();
    return !!b;
  });
  console.log("bell:", bell);
  await ctx.sleep(1000);
  await ctx.shot("p1-3-inbox");

  // ── Шаг 5: ввод ключа + Подтвердить.
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll('input[type="password"]')].pop();
    if (!inp) return;
    const s = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    s.call(inp, "2626");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ctx.sleep(400);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Подтвердить",
    );
    b?.click();
  });
  // ждём: approve → поллинг гейта (3с) → повтор DELETE → тост
  await ctx.sleep(7000);
  const done = await page.evaluate(() => ({
    toast: document.body.innerText.includes("Аренда удалена"),
    gateGone: !document.body.innerText.includes("Запрос отправлен директору"),
  }));
  console.log("result:", JSON.stringify(done));
  await ctx.shot("p1-4-done");
}
