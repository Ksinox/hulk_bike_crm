/** Шаг «Подпись» в мастере продажи: способ расчёта за технику. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3200);
  await ctx.gotoRoute("sales");
  await ctx.sleep(2500);

  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => (b.textContent || "").trim() === "Сделки")
      ?.click();
  });
  await ctx.sleep(1500);
  // Открываем незавершённую сделку (статус «договор»)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Договор/i.test(x.textContent || ""),
    );
    b?.click();
  });
  await ctx.sleep(1500);
  console.log(
    "дровер:",
    await page.evaluate(() =>
      document.body.innerText.includes("Продолжить оформление")
        ? "есть кнопка"
        : document.body.innerText.slice(0, 200).split("\n").join(" / "),
    ),
  );
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /Продолжить оформление/.test(b.textContent || ""))
      ?.click();
  });
  await ctx.sleep(1800);
  // Проматываем мастер до последнего шага
  for (let i = 0; i < 6; i++) {
    const at = await page.evaluate(() => {
      const t = document.body.innerText;
      if (t.includes("Расчёт за технику")) return "done";
      const b = [...document.querySelectorAll("button")].find((x) =>
        /^Дальше|^Далее/.test((x.textContent || "").trim()),
      );
      if (!b) return "нет кнопки";
      b.click();
      return "next";
    });
    if (at === "done" || at === "нет кнопки") {
      console.log("шаг:", at, "итерация", i);
      break;
    }
    await ctx.sleep(1400);
  }
  console.log(
    "подпись:",
    await page.evaluate(() => {
      const t = document.body.innerText;
      const i = t.indexOf("Расчёт за технику");
      return i < 0 ? "НЕТ БЛОКА" : t.slice(i, i + 160).split("\n").join(" / ");
    }),
  );
  await ctx.shot("v6-sale-paymethod", { jpeg: true });
}
