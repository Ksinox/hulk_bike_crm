/** Пункты 25-26 на лендинге: раскрываем истории и проверяем кадры «было». */
export async function run(page, ctx) {
  await ctx.gotoRoute("progress");
  await ctx.sleep(2600);

  for (const [num, title] of [
    ["25", "Партнёрство при добавлении"],
    ["26", "Проданная техника выбывает"],
  ]) {
    const opened = await page.evaluate((t) => {
      const row = [...document.querySelectorAll("button, div[role='button']")].find(
        (b) => new RegExp(t).test(b.textContent || ""),
      );
      if (!row) return false;
      row.scrollIntoView({ block: "center" });
      row.click();
      return true;
    }, title);
    await ctx.sleep(1600);
    const imgs = await page.evaluate(() =>
      [...document.querySelectorAll("img")]
        .map((i) => i.getAttribute("src") || "")
        .filter((s) => /p2[56]-/.test(s)),
    );
    console.log(`пункт ${num}: открыт=${opened}`, JSON.stringify(imgs));
    await ctx.shot(`chk-landing-p${num}`, { jpeg: true });
  }
}
