/**
 * Правки 2.0, пункты 2.1–2.3 — живая проверка + кадры для лендинга.
 *
 * 2.1: аренда #43 — «дважды продлённая» (21 дн, заплачено 10 500 ₽),
 *      возврат сегодня. Старый чипс показал бы 10 500 (историю оплат),
 *      новый должен показать 3 500 — продление на неделю по её тарифу.
 * 2.2: ключ директора при смене рамы/двигателя (окно с деталями).
 * 2.3: пробег при возврате обязателен.
 */
import { API, clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  // ── 2.1: чипс «Поступит сегодня» ──
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2800);
  const chip = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      value: (t.match(/Поступит сегодня\s*\n\s*\+?([\d\s  ]+)/) || [])[1]?.trim(),
      foot: (t.match(/\d+ возврат[а-я]* — продлени[а-я]*\??/) || [""])[0],
    };
  });
  console.log("2.1 чипс:", JSON.stringify(chip), "— ожидаем 3 500");
  await ctx.shot("v2-1-chip", { jpeg: true });
  const chipClip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (d) =>
            /Поступит сегодня/.test(d.textContent || "") &&
            (d.textContent || "").length < 200,
        )
        .pop();
      return el ?? document.body;
    },
    10,
  );
  if (chipClip) await ctx.shot("v2-1-chip-crop", { clip: chipClip });

  // список возвращающих: там та же ожидаемая сумма
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("div,button")]
      .filter(
        (d) =>
          /Поступит сегодня/.test(d.textContent || "") &&
          (d.textContent || "").length < 200,
      )
      .pop();
    el?.click();
  });
  await ctx.sleep(1400);
  await ctx.shot("v2-1-drawer", { jpeg: true });
  await page.keyboard.press("Escape");
  await ctx.sleep(600);

  // ── 2.2: смена рамы существующего скутера → 428 без ключа ──
  const gate = await page.evaluate(async (api) => {
    const items = await fetch(api + "/api/scooters", { credentials: "include" })
      .then((x) => x.json())
      .then((x) => x.items ?? x);
    const withVin = items.find((s) => (s.vin ?? "").trim() && s.baseStatus === "rental_pool");
    if (!withVin) return { ok: false, reason: "нет скутера с VIN" };
    const noKey = await fetch(api + "/api/scooters/" + withVin.id, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vin: withVin.vin + "X" }),
    });
    const body = await noKey.json().catch(() => ({}));
    // с ключом — должно пройти, и вернём как было
    const v = await fetch(api + "/api/approvals/verify", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "2626", action: "scooter_identity_change" }),
    }).then((x) => x.json());
    const withKey = await fetch(api + "/api/scooters/" + withVin.id, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(v?.pass ? { "x-director-approval": "pass:" + v.pass } : {}),
      },
      body: JSON.stringify({ vin: withVin.vin }),
    });
    return {
      scooter: withVin.name,
      noKeyStatus: noKey.status,
      noKeyError: body?.error,
      withKeyStatus: withKey.status,
    };
  }, API(ctx.base));
  console.log("2.2 гейт:", JSON.stringify(gate), "— ждём 428 / 200 / 200");

  // UI: окно ключа при смене рамы в карточке
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2200);
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('div[role="button"]')].filter(
      (r) => /Открыть/.test(r.textContent || "") && (r.textContent || "").length < 400,
    );
    rows[0]?.click();
  });
  await ctx.sleep(2400);
  const cardState = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((x) =>
      /Редактировать/.test(x.textContent || ""),
    );
    return {
      hasEdit: !!btn,
      head: document.body.innerText.slice(0, 120),
    };
  });
  console.log("2.2 карточка:", JSON.stringify(cardState));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Редактировать/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(1600);
  const edited = await page.evaluate(() => {
    const formOpen = /редактирование/i.test(document.body.innerText);
    // Точный поиск: самый глубокий блок с label «Номер рамы» и input внутри
    // Field в форме — это <label>, не div
    const fieldBox = [...document.querySelectorAll("label")]
      .filter(
        (d) =>
          /номер рамы/i.test(d.textContent || "") &&
          d.querySelector("input"),
      )
      .pop();
    const frame = fieldBox?.querySelector("input");
    if (!frame) return { found: false, formOpen };
    const s = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    const oldV = frame.value;
    s.call(frame, oldV + "9");
    frame.dispatchEvent(new Event("input", { bubbles: true }));
    return { found: true, oldV };
  });
  console.log("2.2 поле рамы:", JSON.stringify(edited));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Сохранить",
    );
    b?.click();
  });
  await ctx.sleep(1800);
  const gateUi = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      window: /ключ директора/i.test(t),
      title: /изменение номера рамы/i.test(t),
      diff: /→/.test((t.match(/Рама\/VIN:[^\n]*/) || [""])[0]),
    };
  });
  console.log("2.2 окно:", JSON.stringify(gateUi));
  await ctx.shot("v2-2-gate", { jpeg: true });
  const gateClip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (d) =>
            /ключ директора/i.test(d.textContent || "") &&
            /Подтвердить/.test(d.textContent || "") &&
            (d.textContent || "").length < 900,
        )
        .pop();
      return el ?? document.body;
    },
    10,
  );
  if (gateClip) await ctx.shot("v2-2-gate-crop", { clip: gateClip });
  // Гейт не закрывается Escape — жмём его крестик, затем закрываем форму
  await page.evaluate(() => {
    const gate = [...document.querySelectorAll("div")]
      .filter(
        (d) =>
          /ключ директора/i.test(d.textContent || "") &&
          /Подтвердить/.test(d.textContent || "") &&
          (d.textContent || "").length < 900,
      )
      .pop();
    const x = gate?.querySelector("button");
    x?.click();
  });
  await ctx.sleep(700);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Отмена",
    );
    b?.click();
  });
  await ctx.sleep(700);
  await page.keyboard.press("Escape");
  await ctx.sleep(600);
  console.log(
    "гейт закрыт:",
    await page.evaluate(() => !/ключ директора/i.test(document.body.innerText)),
  );

  // ── 2.3: пробег обязателен при завершении ──
  await ctx.gotoRoute("rentals", { rentalId: 43 });
  await ctx.sleep(2200);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Закрыть аренду/.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(2200);
  // отметить «Без ущерба» по всем позициям, причину возврата выбрать
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .filter((b) => /Без ущерба|Как новый|Всё ок|ОК/.test((b.textContent || "").trim()))
      .forEach((b) => b.click());
  });
  await ctx.sleep(800);
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /Завершить аренду|Завершить/.test((b.textContent || "").trim()),
    );
    return {
      gateLeak: /ключ директора/i.test(t),
      required: /обязательно/.test(t),
      disabled: btn?.disabled ?? null,
      btnText: (btn?.textContent || "").trim().slice(0, 30),
    };
  });
  console.log("2.3 без пробега:", JSON.stringify(st), "— ждём disabled=true");
  await ctx.shot("v2-3-required", { jpeg: true });
  const mClip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (d) =>
            /Пробег, км/.test(d.textContent || "") &&
            /Дата возврата/.test(d.textContent || "") &&
            (d.textContent || "").length < 400,
        )
        .pop();
      return el ?? document.body;
    },
    10,
  );
  if (mClip) await ctx.shot("v2-3-required-crop", { clip: mClip });

  // вводим пробег → кнопка должна ожить
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find(
      (i) => i.type === "number" && /обязательно|Пробег/i.test(i.closest("div")?.textContent || ""),
    );
    if (!inp) return;
    const s = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    s.call(inp, "12345");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ctx.sleep(700);
  const st2 = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /Завершить/.test((b.textContent || "").trim()),
    );
    return { disabled: btn?.disabled ?? null };
  });
  console.log("2.3 с пробегом:", JSON.stringify(st2), "— долг/причина могут ещё блокировать");
  await ctx.shot("v2-3-filled", { jpeg: true });
}
