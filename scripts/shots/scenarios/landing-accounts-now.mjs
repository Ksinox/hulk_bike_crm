/**
 * «Стало» для пунктов про личные аккаунты (14.09).
 * SHOT_PART=director — экран «Сотрудники» у директора;
 * SHOT_PART=staff — CRM глазами тестового сотрудника без прибыли и долей.
 */
export async function run(page, ctx) {
  const S = (n) => ctx.shot(n, { jpeg: true });
  const part = process.env.SHOT_PART || "director";
  const dismiss = () =>
    page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => /^Позже$/.test((b.textContent || "").trim()))
        ?.click();
    });
  const click = (re) =>
    page.evaluate((src) => {
      const rx = new RegExp(src);
      const b = [...document.querySelectorAll("button")].find((x) => rx.test((x.textContent || "").trim()));
      b?.click();
      return !!b;
    }, re);
  const text = () => page.evaluate(() => document.body.innerText);

  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5500);
  await dismiss();

  if (part === "director") {
    await ctx.gotoRoute("staff");
    await ctx.sleep(3000);
    await dismiss();
    await S("acc-now-01-staff");

    await click("Добавить сотрудника");
    await ctx.sleep(1800);
    await S("acc-now-02-add");
    await click("^Отмена$");
    await ctx.sleep(700);

    // правка тестового аккаунта
    await page.evaluate(() => {
      const row = [...document.querySelectorAll("tr")].find((r) => /Проверка прав/.test(r.textContent || ""));
      const btn = row && [...row.querySelectorAll("button")].find((b) => /Изменить/.test(b.getAttribute("title") || b.getAttribute("aria-label") || b.textContent || ""));
      (btn || row?.querySelectorAll("button")[1])?.click();
    });
    await ctx.sleep(2500);
    await S("acc-now-03-edit-off");
    console.log("окно правки:", JSON.stringify({
      предпросмотр: /Как увидит/.test(await text()),
      прибыльВПредпросмотре: await page.evaluate(() =>
        [...document.querySelectorAll("[role=dialog] section")].some((s) => /Продажи/.test(s.textContent || "") && /Прибыль/.test(s.textContent || "")),
      ),
    }));
    // включаем «Прибыль, закуп и маржа» — предпросмотр меняется, не сохраняем
    await page.evaluate(() => document.getElementById("perm-data.profit")?.click());
    await page.evaluate(() => document.getElementById("perm-data.partnerShares")?.click());
    await ctx.sleep(900);
    console.log("после включения:", JSON.stringify({
      прибыльВПредпросмотре: await page.evaluate(() =>
        [...document.querySelectorAll("[role=dialog] section")].some((s) => /Продажи/.test(s.textContent || "") && /Прибыль/.test(s.textContent || "")),
      ),
    }));
    await S("acc-now-04-edit-on");
    await click("^Отмена$");
    await ctx.sleep(600);

    // телефон: «Сотрудники» и окно аккаунта
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
    await ctx.sleep(5000);
    await dismiss();
    await ctx.gotoRoute("staff");
    await ctx.sleep(3000);
    await S("acc-now-05-mobile-staff");
    await click("Новый сотрудник");
    await ctx.sleep(1800);
    await page.evaluate(() => {
      const el = [...document.querySelectorAll("h3")].find((h) => /Новый сотрудник или уже/.test(h.textContent || ""));
      el?.scrollIntoView({ block: "start" });
    });
    await ctx.sleep(700);
    await S("acc-now-06-mobile-question");
    return;
  }

  // ---------------- глазами сотрудника ----------------
  await ctx.gotoRoute("sales");
  await ctx.sleep(3800);
  const t1 = await text();
  console.log("продажи сотрудник:", JSON.stringify({
    прибыль: /ПРИБЫЛЬ|Прибыль/.test(t1),
    маржа: /Маржинальность/.test(t1),
    прибыльСкрыта: /Прибыль скрыта/.test(t1),
  }));
  await S("acc-now-10-staff-sales");

  await ctx.gotoRoute("service");
  await ctx.sleep(3500);
  const t2 = await text();
  console.log("ремонты сотрудник:", JSON.stringify({ прибыль: /Прибыль/.test(t2) }));
  await S("acc-now-11-staff-service");

  await ctx.gotoRoute("partners");
  await ctx.sleep(3200);
  const t3 = await text();
  console.log("партнёрка сотрудник:", JSON.stringify({ инвесторы: /Инвесторы/.test(t3) }));
  await click("Электротранспорт");
  await ctx.sleep(2000);
  const t4 = await text();
  console.log("электротранспорт:", JSON.stringify({ доля: /Доля инвесторов|Наша доля|Инвестору/.test(t4) }));
  await S("acc-now-12-staff-partners");

  await ctx.gotoRoute("analytics");
  await ctx.sleep(3800);
  const t5 = await text();
  console.log("аналитика сотрудник:", JSON.stringify({ прибыль: /Прибыль с продаж|Прибыль с ремонтов/.test(t5) }));
  await S("acc-now-13-staff-analytics");

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await dismiss();
  await ctx.gotoRoute("sales");
  await ctx.sleep(3500);
  await S("acc-now-14-staff-sales-mobile");
  await ctx.gotoRoute("service");
  await ctx.sleep(3300);
  await S("acc-now-15-staff-service-mobile");
}
