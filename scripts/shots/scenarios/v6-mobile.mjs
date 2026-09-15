/** Мобильный слой: напоминания на дашборде + раздел выкупа. */
export async function run(page, ctx) {
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  await ctx.gotoRoute("dashboard");
  await ctx.sleep(1200);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(4000);
  console.log(
    "дашборд:",
    await page.evaluate(() => {
      const t = document.body.innerText;
      const i = t.indexOf("Напоминания");
      return {
        found: i >= 0,
        text: i < 0 ? t.slice(0, 120).split("\n").join(" / ") : t.slice(i, i + 140).split("\n").join(" / "),
        overflowX:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      };
    }),
  );
  await ctx.shot("v6-mobile-reminders", { jpeg: true });

  await ctx.gotoRoute("rassrochki");
  await ctx.sleep(2800);
  console.log(
    "выкуп:",
    await page.evaluate(() => {
      const bar = [...document.querySelectorAll("div")].find(
        (d) => d.className && String(d.className).includes("rounded-xl bg-surface px-3 py-2.5"),
      );
      const tabs = [...document.querySelectorAll("button")]
        .filter((b) => /Обзор|Выкупы|Просрочки|Клиенты/.test(b.textContent || ""))
        .map((b) => {
          const r = b.getBoundingClientRect();
          return `${(b.textContent || "").trim()}@${Math.round(r.left)}..${Math.round(r.right)}`;
        });
      return {
        desktopTopbar: !!bar,
        tabs,
        tabsFit: tabs.every((x) => Number(x.split("..")[1]) <= window.innerWidth),
        chart: document.body.innerText.includes("Динамика платежей"),
        overflowX:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      };
    }),
  );
  await ctx.shot("v6-mobile-buyout", { jpeg: true });
}
