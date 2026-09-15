/**
 * 15.09: поиск по номеру скутера и пометка бывшего номера.
 * 1) разбор запросов (модуль импортируется в браузере с dev-сервера);
 * 2) «Скутеры»: фильтр моделей поверх списка, поиск «1» / «01» / «№1».
 */
export async function run(page, ctx) {
  await page.setViewport({ width: 1470, height: 1000, deviceScaleFactor: 1 });
  await page.goto(ctx.base + "/", { waitUntil: "domcontentloaded" });
  await ctx.sleep(5000);

  const cases = await page.evaluate(async () => {
    const m = await import("/src/lib/search.ts");
    const inputs = ["5", "05", "№5", "# 5", "номер 5", "айма 01", "AIMA 1", "jog5", "джог 12",
      "бывший 80", "бывш. 80", "1234", "Иванов", "VIN123", "ay01 87", "0"];
    const parsed = Object.fromEntries(inputs.map((s) => [s, m.parseScooterNumberQuery(s)]));
    const sc = [
      { name: "aima #01", rentalSlot: 68, exRentalSlot: null },
      { name: "Jog #01", rentalSlot: 1, exRentalSlot: null },
      { name: "Gear #80", rentalSlot: null, exRentalSlot: 80 },
      { name: "Gear #81", rentalSlot: null, exRentalSlot: null },
    ];
    const q = (s) => m.parseScooterNumberQuery(s);
    const match = (s) => sc.map((x) => `${x.name}:${m.matchScooterNumber(x, q(s), "") ?? "-"}`).join(", ");
    return {
      parsed,
      "1": match("1"),
      "айма 01": match("айма 01"),
      "80": match("80"),
      "бывший 80": match("бывший 80"),
      "81": match("81"),
      "68": match("68"),
    };
  });
  console.log(JSON.stringify(cases, null, 1));

  await ctx.gotoRoute("fleet");
  await ctx.sleep(2500);
  await page.evaluate(() => document.querySelector('button[title^="Фильтр моделей"]')?.click());
  await ctx.sleep(700);
  const popTop = await page.evaluate(() => {
    const head = [...document.querySelectorAll("div")].find((d) => d.textContent?.trim() === "Фильтр по моделям");
    if (!head) return "нет окна";
    const r = head.parentElement.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + 60);
    return head.parentElement.contains(el) ? "окно сверху" : `перекрыто: ${el?.tagName}.${String(el?.className).slice(0, 40)}`;
  });
  console.log("фильтр моделей:", popTop);
  await ctx.shot("num-01-filter", { jpeg: true });
  await page.keyboard.press("Escape");

  for (const term of ["1", "01", "№7"]) {
    await page.evaluate((t) => {
      const i = document.querySelector('input[placeholder^="Номер, модель"]');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(i, t);
      i.dispatchEvent(new Event("input", { bubbles: true }));
    }, term);
    await ctx.sleep(900);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('[role="button"]')]
        .map((r) => (r.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60))
        .filter((t) => /Jog|Gear|AIMA|aima|U-5|Tank/i.test(t))
        .slice(0, 5),
    );
    console.log(`поиск «${term}»:`, JSON.stringify(rows));
  }
  await ctx.shot("num-02-search", { jpeg: true });
}
