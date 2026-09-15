/**
 * 15.09, превью: «Скутеры» — фильтр моделей поверх списка, поиск по номеру,
 * пометка «Бывший №» у техники вне аренды. Компьютер + телефон.
 */
export async function run(page, ctx) {
  const typeSearch = (sel, t) =>
    page.evaluate(
      (sel, t) => {
        const i = document.querySelector(sel);
        if (!i) return false;
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        set.call(i, t);
        i.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      },
      sel,
      t,
    );
  const rows = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[role="button"]')]
        .map((r) => (r.textContent || "").replace(/\s+/g, " ").trim())
        .filter((t) => /Jog|Gear|AIMA|U-5|Tank|Dio/i.test(t) && t.length < 200)
        .slice(0, 6)
        .map((t) => t.slice(0, 70)),
    );

  await page.setViewport({ width: 1470, height: 1000, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);

  // данные превью: у кого есть бывший номер
  const ex = await page.evaluate(async () => {
    const api = location.origin.replace("crm-", "api-");
    const r = await fetch(api + "/api/scooters", { credentials: "include" });
    const j = await r.json();
    const list = (j.items ?? j).filter((s) => s.rentalSlot == null && s.exRentalSlot != null);
    return list.slice(0, 3).map((s) => ({ name: s.name, ex: s.exRentalSlot, status: s.baseStatus }));
  });
  console.log("с бывшим номером:", JSON.stringify(ex));

  await page.evaluate(() => document.querySelector('button[title^="Фильтр моделей"]')?.click());
  await ctx.sleep(700);
  console.log(
    "фильтр моделей:",
    await page.evaluate(() => {
      const head = [...document.querySelectorAll("div")].find((d) => d.textContent?.trim() === "Фильтр по моделям");
      if (!head) return "нет окна";
      const r = head.parentElement.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + 60);
      return head.parentElement.contains(el) ? "окно сверху" : "перекрыто";
    }),
  );
  await ctx.shot("np-01-filter", { jpeg: true });
  await page.mouse.click(40, 980);
  await ctx.sleep(400);

  for (const t of ["7", "№6", "джог 7"]) {
    await typeSearch('input[placeholder^="Номер, модель"]', t);
    await ctx.sleep(900);
    console.log(`поиск «${t}»:`, JSON.stringify(await rows()));
  }
  await ctx.shot("np-02-search", { jpeg: true });

  if (ex.length) {
    // техника вне аренды — во вкладке «Продажа»
    await typeSearch('input[placeholder^="Номер, модель"]', `бывший ${ex[0].ex}`);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /^Продажа$/.test((x.textContent || "").trim()));
      b?.click();
    });
    await ctx.sleep(1500);
    console.log(`поиск «бывший ${ex[0].ex}»:`, JSON.stringify(await rows()));
    await ctx.shot("np-03-ex", { jpeg: true });
  }

  // общий поиск в шапке
  await typeSearch('input[placeholder^="Поиск: клиент"]', "№7");
  await ctx.sleep(1500);
  console.log(
    "общий поиск «№7»:",
    JSON.stringify(
      await page.evaluate(() =>
        [...document.querySelectorAll("button, a, li")]
          .map((x) => (x.textContent || "").replace(/\s+/g, " ").trim())
          .filter((t) => /№\s?7|номер 7/.test(t) && t.length < 160)
          .slice(0, 4),
      ),
    ),
  );
  await ctx.shot("np-04-global", { jpeg: true });
}
