/** Серия кадров обоих колец: поймать разряд молнии и пузырьки. */
export async function run(page, ctx) {
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(3000);
  const box = await page.evaluate(() => {
    const pick = (re) => {
      const els = [...document.querySelectorAll("button")].filter(
        (b) =>
          re.test(b.textContent || "") && /в\sаренде/.test(b.textContent || ""),
      );
      return els[els.length - 1] ?? null;
    };
    const a = pick(/Загрузка парка/);
    const b = pick(/Электротранспорт/);
    if (!a || !b) return null;
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const x = Math.min(ra.x, rb.x) - 10;
    const y = Math.min(ra.y, rb.y) - 10;
    return {
      x,
      y,
      width: Math.max(ra.right, rb.right) - x + 10,
      height: Math.max(ra.bottom, rb.bottom) - y + 10,
    };
  });
  console.log("box:", JSON.stringify(box));
  if (!box) return;
  for (let i = 0; i < 10; i++) {
    await ctx.shot(`chk-burst-${i}`, { clip: box });
    await ctx.sleep(230);
  }
}
