/**
 * Пункт 1 — путь A: оператор знает ключ и вводит его прямо в окне.
 * Удаляем одноразовую аренду #37 (Павел Морозов) вводом ключа на месте.
 * Заодно фикс конвейера: убеждаемся, что открыта ИМЕННО нужная карточка.
 */
export async function run(page, ctx) {
  await ctx.gotoRoute("rentals", { rentalId: 37 });
  await ctx.sleep(1500);
  // Проверка «та ли карточка открыта» — по номеру в шапке.
  const opened = await page.evaluate(() =>
    document.body.innerText.includes("#0037"),
  );
  if (!opened) {
    // повторная навигация после прогрева кэша списка
    await ctx.gotoRoute("rentals", { rentalId: 37 });
    await ctx.sleep(1500);
  }
  const ok = await page.evaluate(() =>
    document.body.innerText.includes("#0037"),
  );
  console.log("card 37 opened:", ok);
  if (!ok) throw new Error("карточка #0037 не открылась");

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
      (b) => (b.textContent || "").trim() === "Тестовая аренда",
    );
    opt?.click();
  });
  await ctx.sleep(1500);

  // Окно ключа: путь A — ввод ключа на месте.
  const gate = await page.evaluate(() =>
    document.body.innerText.includes("Ключ директора"),
  );
  console.log("gate:", gate);
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll('input[type="password"]')].find(
      (i) => i.placeholder === "Ключ директора",
    );
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
  await ctx.sleep(4000);
  const done = await page.evaluate(() => ({
    toast: document.body.innerText.includes("Аренда удалена"),
  }));
  console.log("path A result:", JSON.stringify(done));
}
