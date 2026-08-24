/** Контроль: истории пунктов 6, 19, 24 на лендинге — картинки грузятся. */
export async function run(page, ctx) {
  await ctx.gotoRoute("progress");
  await ctx.sleep(2000);
  for (const [title, name] of [
    ["Мерцание при выборе произвольного тарифа", "p6"],
    ["Убрать чипс активных аренд", "p19"],
    ["Количество клиентов над списком", "p24"],
  ]) {
    await page.evaluate((t) => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        (x.textContent || "").includes(t),
      );
      b?.click();
      b?.scrollIntoView({ block: "center" });
    }, title);
    await ctx.sleep(1800);
    const imgs = await page.evaluate((pref) =>
      [...document.querySelectorAll("img")]
        .filter((i) => i.src.includes("/progress/" + pref))
        .map((i) => ({
          f: i.src.split("/").pop(),
          ok: i.naturalWidth > 0,
          w: i.naturalWidth,
        })),
    name);
    console.log(name, JSON.stringify(imgs));
    await ctx.shot("landing-" + name, { jpeg: true });
    // свернуть обратно
    await page.evaluate((t) => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        (x.textContent || "").includes(t),
      );
      b?.click();
    }, title);
    await ctx.sleep(600);
  }
}
