/** Правки 27.08: партнёрка — отдельное государство. Обход всех вкладок. */
export async function run(page, ctx) {
  await ctx.gotoRoute("partners");
  await ctx.sleep(2600);

  // 1. Вкладка по умолчанию — «Аренды»
  const st = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll("button")]
      .map((b) => (b.textContent || "").trim())
      .filter((t) => ["Аренды", "Электротранспорт", "Инвесторы"].includes(t));
    return {
      tabsOrder: tabs.slice(0, 3),
      hasRentalsTable: /Аренды партнёрской техники/.test(document.body.innerText),
    };
  });
  console.log("вкладки:", JSON.stringify(st));
  await ctx.shot("v2p-1-rentals-tab", { jpeg: true });

  // 2. Клик по аренде → дровер ВНУТРИ партнёрки
  const opened = await page.evaluate(() => {
    const row = [...document.querySelectorAll("button")].find((b) =>
      /#\d{4}/.test(b.textContent || "") && /Dio|Электро|₽/.test(b.textContent || ""),
    );
    if (!row) return false;
    row.click();
    return true;
  });
  await ctx.sleep(1800);
  const drawer = await page.evaluate(() => ({
    stillInPartners: /Партнёрка/.test(document.body.innerText),
    hasCard: /Информация о клиенте|Скутер и экипировка/.test(document.body.innerText),
  }));
  console.log("дровер:", opened, JSON.stringify(drawer));
  await ctx.shot("v2p-2-rental-drawer", { jpeg: true });
  // закрыть дровер (клик по той же строке)
  await page.evaluate(() => {
    const hide = [...document.querySelectorAll("button")].find((b) =>
      /Скрыть/.test(b.textContent || ""),
    );
    hide?.click();
  });
  await ctx.sleep(600);

  // 3. Электротранспорт: инвестор в таблице, кнопка добавления
  await page.evaluate(() => {
    const t = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim() === "Электротранспорт",
    );
    t?.click();
  });
  await ctx.sleep(1400);
  const fleet = await page.evaluate(() => ({
    hasAdd: /Добавить технику/.test(document.body.innerText),
    hasInvestorCol: /Инвестор/.test(document.body.innerText),
    noOldEdit: !/Процент инвестора по умолчанию/.test(document.body.innerText),
  }));
  console.log("электро:", JSON.stringify(fleet));
  await ctx.shot("v2p-3-fleet-tab", { jpeg: true });

  // 4. Клик по строке техники → карточка внутри партнёрки
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("tbody tr")][0];
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await ctx.sleep(1800);
  const card = await page.evaluate(() => ({
    hasBack: /в партнёрку/.test(document.body.innerText),
    hasCard: /Пробег|VIN|Статус/.test(document.body.innerText),
  }));
  console.log("карточка техники:", JSON.stringify(card));
  await ctx.shot("v2p-4-scooter-card", { jpeg: true });
  await page.evaluate(() => {
    const back = [...document.querySelectorAll("button")].find((b) =>
      /в партнёрку/.test(b.textContent || ""),
    );
    back?.click();
  });
  await ctx.sleep(1200);

  // 5. Инвесторы: карточка с «К выплате сейчас»
  await page.evaluate(() => {
    const t = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim() === "Инвесторы",
    );
    t?.click();
  });
  await ctx.sleep(1400);
  await ctx.shot("v2p-5-investors-list", { jpeg: true });
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("button")].find((b) =>
      /Волков/.test(b.textContent || ""),
    );
    row?.click();
  });
  await ctx.sleep(1800);
  const inv = await page.evaluate(() => ({
    accrued: /К выплате сейчас/.test(document.body.innerText),
    payBtn: (document.body.innerText.match(/Выплатить [\d\s]+₽/) || [])[0] ?? null,
    sharePill: /\d+ %/.test(document.body.innerText),
    addTech: /Добавить технику/.test(document.body.innerText),
  }));
  console.log("инвестор:", JSON.stringify(inv));
  await ctx.shot("v2p-6-investor-card", { jpeg: true });

  // 6. Кнопка «Изменить» — форма с процентом
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Изменить",
    );
    b?.click();
  });
  await ctx.sleep(1000);
  const form = await page.evaluate(() => ({
    formOpen: /Процент инвестора/.test(document.body.innerText),
    title: /Изменение/.test(document.body.innerText),
  }));
  console.log("форма изменения:", JSON.stringify(form));
  await ctx.shot("v2p-7-investor-edit", { jpeg: true });
}
